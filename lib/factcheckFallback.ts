import { extractBalancedJsonObject } from "@/lib/extractJson";
import type { FactCheck, FactStatus } from "./types";

/** True when the API returned the hardcoded parse-failure placeholder. */
export function isFactcheckFallback(fc: FactCheck): boolean {
  return (
    fc.facts.length === 1 &&
    fc.facts[0].claim === "Could not parse" &&
    fc.facts[0].comment === "Parse error"
  );
}

export const FACTCHECK_PARSE_FALLBACK: FactCheck = {
  facts: [
    {
      claim: "Could not parse",
      status: "disputed",
      comment: "Parse error",
    },
  ],
  relevance: 50,
  flags: [],
  flag_details: [],
};

function normalizeFactStatus(s: unknown): FactStatus {
  const x = String(s ?? "")
    .toLowerCase()
    .trim();
  if (x === "verified" || x === "disputed" || x === "false") return x;
  return "disputed";
}

function normalizeRelevance(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(100, Math.max(0, v));
  }
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    if (Number.isFinite(n)) return Math.min(100, Math.max(0, n));
  }
  return 50;
}

function sanitizeClaimText(v: string): string {
  return v
    .replace(/```(?:json)?/gi, " ")
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCommentText(v: string): string {
  let text = v.replace(/\uFFFD/g, "").trim();
  // If model started to emit a second JSON object inside comment, cut it.
  text = text.replace(/```(?:json)?[\s\S]*$/i, "").trim();
  text = text.replace(/\n\s*\{\s*"facts"[\s\S]*$/i, "").trim();
  text = text.replace(/\{\s*"facts"[\s\S]*$/i, "").trim();
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function unwrapFactcheckPayload(parsed: unknown): Record<string, unknown> | null {
  let p: unknown = parsed;
  for (let i = 0; i < 4; i++) {
    if (typeof p === "string") {
      const t = p.trim();
      if (!t) return null;
      try {
        p = JSON.parse(t) as unknown;
      } catch {
        return null;
      }
      continue;
    }
    break;
  }
  if (Array.isArray(p)) {
    if (p.length === 0) return null;
    return {
      facts: p,
      relevance: 50,
      flags: [],
      flag_details: [],
    };
  }
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (Array.isArray(o.facts)) return o;
  for (const k of [
    "result",
    "data",
    "factcheck",
    "output",
    "response",
    "judge",
  ]) {
    const inner = o[k];
    if (
      inner &&
      typeof inner === "object" &&
      Array.isArray((inner as Record<string, unknown>).facts)
    ) {
      return inner as Record<string, unknown>;
    }
  }
  return o;
}

function parseFactcheckObject(parsed: unknown): FactCheck | null {
  const root = unwrapFactcheckPayload(parsed);
  if (!root) return null;
  const o = root;
  let factsRaw: unknown = o.facts;
  if (typeof factsRaw === "string") {
    try {
      factsRaw = JSON.parse(factsRaw) as unknown;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(factsRaw)) return null;

  const facts = factsRaw.map((item) => {
    const f = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      claim: sanitizeClaimText(
        typeof f.claim === "string" ? f.claim : String(f.claim ?? "Claim"),
      ) || "Claim",
      status: normalizeFactStatus(f.status),
      comment: sanitizeCommentText(
        typeof f.comment === "string" ? f.comment : String(f.comment ?? ""),
      ),
    };
  });

  return {
    facts,
    relevance: normalizeRelevance(o.relevance),
    flags: Array.isArray(o.flags) ? o.flags.map(String) : [],
    flag_details: Array.isArray(o.flag_details)
      ? o.flag_details.map(String)
      : [],
  };
}

function unescapeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
}

function recoverFactcheckFromPartialRaw(raw: string): FactCheck | null {
  const facts: FactCheck["facts"] = [];
  // Pair claim + status; comment is optional (may be missing or truncated).
  const reFull =
    /"claim"\s*:\s*"((?:\\.|[^"\\])*)"\s*,[\s\S]*?"status"\s*:\s*"((?:\\.|[^"\\])*)"\s*,[\s\S]*?"comment"\s*:\s*"((?:\\.|[^"\\])*)"/gm;
  const seenClaims = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = reFull.exec(raw)) !== null) {
    const claim = sanitizeClaimText(unescapeJsonString(m[1])) || "Claim";
    facts.push({
      claim,
      status: normalizeFactStatus(unescapeJsonString(m[2])),
      comment: sanitizeCommentText(unescapeJsonString(m[3])),
    });
    seenClaims.add(claim);
  }
  if (facts.length === 0) {
    // Salvage pairs with missing/truncated comment.
    const rePair =
      /"claim"\s*:\s*"((?:\\.|[^"\\])*)"\s*,[\s\S]*?"status"\s*:\s*"((?:\\.|[^"\\])*)"/gm;
    while ((m = rePair.exec(raw)) !== null) {
      const claim = sanitizeClaimText(unescapeJsonString(m[1])) || "Claim";
      if (seenClaims.has(claim)) continue;
      facts.push({
        claim,
        status: normalizeFactStatus(unescapeJsonString(m[2])),
        comment: "",
      });
      seenClaims.add(claim);
    }
  }
  if (facts.length === 0) return null;

  const uniqueFacts = Array.from(
    new Map(
      facts.map((f) => [`${f.claim}::${f.status}`, f]),
    ).values(),
  );
  const relM = /"relevance"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(raw);

  return {
    facts: uniqueFacts,
    relevance: normalizeRelevance(relM?.[1]),
    flags: [],
    flag_details: [],
  };
}

function tryParseBlock(text: string): FactCheck | null {
  const extracted = extractBalancedJsonObject(text);
  const candidates = extracted
    ? Array.from(new Set([extracted, text]))
    : [text];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const ok = parseFactcheckObject(parsed);
      if (ok) return ok;
    } catch {
      /* try next candidate */
    }
    const partial = recoverFactcheckFromPartialRaw(candidate);
    if (partial) return partial;
  }
  return null;
}

export function parseFactcheckJson(raw: string): FactCheck {
  // Remove [cite: N, N] markers that pollute string values and break deduplication
  const cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\[cite:\s*[\d,\s]+\]/gi, "");

  // extractBalancedJsonObject respects string boundaries (handles ``` inside string values),
  // so try it first on the full cleaned string before the fence-regex path.
  const balancedExtract = extractBalancedJsonObject(cleaned);
  if (balancedExtract) {
    const ok = tryParseBlock(balancedExtract);
    if (ok) return ok;
  }

  // Try every fenced ```json``` block in order (model sometimes emits two blocks).
  // Note: the fence regex is NOT string-aware, so backtick sequences inside JSON string
  // values can cause early termination — the balanced path above is the safer primary path.
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(cleaned)) !== null) {
    const block = m[1].trim();
    if (!block) continue;
    const ok = tryParseBlock(block);
    if (ok) return ok;
  }

  // Last resort: try the cleaned string as-is
  const ok = tryParseBlock(cleaned);
  if (ok) return ok;

  return FACTCHECK_PARSE_FALLBACK;
}
