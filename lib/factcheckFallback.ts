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

function parseFactcheckObject(parsed: unknown): FactCheck | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const factsRaw = o.facts;
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

export function parseFactcheckJson(raw: string): FactCheck {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const extracted = extractBalancedJsonObject(stripped);
  const candidates = extracted
    ? Array.from(new Set([extracted, stripped]))
    : [stripped];

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const ok = parseFactcheckObject(parsed);
      if (ok) return ok;
    } catch {
      /* try next */
    }
  }

  return FACTCHECK_PARSE_FALLBACK;
}
