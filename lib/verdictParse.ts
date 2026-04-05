import { extractBalancedJsonObject } from "@/lib/extractJson";
import type { Verdict } from "@/lib/types";

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

function normalizePair(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const a = Number(raw[0]);
  const b = Number(raw[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [clampScore(a), clampScore(b)];
}

function normalizeBreakdown(
  b: unknown,
): Verdict["breakdown"] | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const factual = normalizePair(o.factual);
  const logic = normalizePair(o.logic);
  const relevance = normalizePair(o.relevance);
  const rhetoric = normalizePair(o.rhetoric);
  if (!factual || !logic || !relevance || !rhetoric) return null;
  return { factual, logic, relevance, rhetoric };
}

export const VERDICT_PARSE_FALLBACK: Verdict = {
  score_player: 50,
  score_opponent: 50,
  breakdown: {
    factual: [50, 50],
    logic: [50, 50],
    relevance: [50, 50],
    rhetoric: [50, 50],
  },
  summary: "Could not parse verdict JSON.",
  best_arg_player: "—",
  best_arg_opponent: "—",
};

export function parseVerdictJson(raw: string): Verdict {
  const trimmed = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const extracted = extractBalancedJsonObject(trimmed);
  const candidates = extracted
    ? Array.from(new Set([extracted, trimmed]))
    : [trimmed];

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const sp = Number(parsed.score_player);
      const so = Number(parsed.score_opponent);
      if (!Number.isFinite(sp) || !Number.isFinite(so) || typeof parsed.summary !== "string") {
        continue;
      }
      const breakdown = normalizeBreakdown(parsed.breakdown);
      if (!breakdown) continue;
      return {
        score_player: clampScore(sp),
        score_opponent: clampScore(so),
        breakdown,
        summary: parsed.summary,
        best_arg_player:
          typeof parsed.best_arg_player === "string"
            ? parsed.best_arg_player
            : "—",
        best_arg_opponent:
          typeof parsed.best_arg_opponent === "string"
            ? parsed.best_arg_opponent
            : "—",
      };
    } catch {
      /* try next candidate */
    }
  }

  return VERDICT_PARSE_FALLBACK;
}
