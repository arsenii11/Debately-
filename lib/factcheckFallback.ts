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
      claim: typeof f.claim === "string" ? f.claim : String(f.claim ?? "Claim"),
      status: normalizeFactStatus(f.status),
      comment:
        typeof f.comment === "string"
          ? f.comment
          : String(f.comment ?? ""),
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
  const re =
    /"claim"\s*:\s*"((?:\\.|[^"\\])*)"\s*,[\s\S]*?"status"\s*:\s*"((?:\\.|[^"\\])*)"\s*,[\s\S]*?"comment"\s*:\s*"((?:\\.|[^"\\])*)"/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    facts.push({
      claim: unescapeJsonString(m[1]).trim() || "Claim",
      status: normalizeFactStatus(unescapeJsonString(m[2])),
      comment: unescapeJsonString(m[3]).trim(),
    });
  }
  if (facts.length === 0) return null;

  const uniqueFacts = Array.from(
    new Map(
      facts.map((f) => [`${f.claim}::${f.status}::${f.comment}`, f]),
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

  // Try every fenced ```json``` block in order (model sometimes emits two blocks)
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(cleaned)) !== null) {
    const block = m[1].trim();
    if (!block) continue;
    const ok = tryParseBlock(block);
    if (ok) return ok;
  }

  // No fenced blocks, or all failed — try the cleaned string directly
  const ok = tryParseBlock(cleaned);
  if (ok) return ok;

  return FACTCHECK_PARSE_FALLBACK;
}
