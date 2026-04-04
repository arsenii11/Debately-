import { extractBalancedJsonObject } from "@/lib/extractJson";
import type { Verdict } from "@/lib/types";

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
      const parsed = JSON.parse(text) as Verdict;
      if (
        typeof parsed.score_player !== "number" ||
        typeof parsed.score_opponent !== "number" ||
        !parsed.breakdown ||
        typeof parsed.summary !== "string"
      ) {
        continue;
      }
      return {
        score_player: parsed.score_player,
        score_opponent: parsed.score_opponent,
        breakdown: parsed.breakdown,
        summary: parsed.summary,
        best_arg_player: parsed.best_arg_player ?? "—",
        best_arg_opponent: parsed.best_arg_opponent ?? "—",
      };
    } catch {
      /* try next candidate */
    }
  }

  return VERDICT_PARSE_FALLBACK;
}
