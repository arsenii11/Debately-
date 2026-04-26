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

function breakdownFromScores(
  scorePlayer: number,
  scoreOpponent: number,
): Verdict["breakdown"] {
  const p = clampScore(scorePlayer);
  const o = clampScore(scoreOpponent);
  return {
    factual: [p, o],
    logic: [p, o],
    relevance: [p, o],
    rhetoric: [p, o],
  };
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

export function isVerdictFallback(v: Verdict): boolean {
  return v.summary === VERDICT_PARSE_FALLBACK.summary;
}

function extractJsonStringValue(raw: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"`, "m");
  const m = re.exec(raw);
  if (!m || m.index === undefined) return null;
  let i = m.index + m[0].length;
  let out = "";
  while (i < raw.length) {
    const c = raw[i];
    if (c === "\\") {
      if (i + 1 >= raw.length) break;
      const n = raw[i + 1];
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "r") out += "\r";
      else out += n;
      i += 2;
      continue;
    }
    if (c === '"') return out;
    out += c;
    i++;
  }
  return out.length > 0 ? `${out}…` : null;
}

function extractPairField(raw: string, key: string): [number, number] | null {
  const re = new RegExp(
    `"${key}"\\s*:\\s*\\[\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\]`,
  );
  const m = re.exec(raw);
  if (!m) return null;
  return [clampScore(Number(m[1])), clampScore(Number(m[2]))];
}

/**
 * When JSON.parse fails (truncated output, bad escapes), pull numeric fields and
 * optional string fields from the raw text.
 */
export function recoverVerdictFromPartialRaw(raw: string): Verdict | null {
  const spM = /"score_player"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(raw);
  const soM = /"score_opponent"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(raw);
  if (!spM || !soM) return null;

  const factual = extractPairField(raw, "factual");
  const logic = extractPairField(raw, "logic");
  const relevance = extractPairField(raw, "relevance");
  const rhetoric = extractPairField(raw, "rhetoric");
  if (!factual || !logic || !relevance || !rhetoric) return null;

  const summary =
    extractJsonStringValue(raw, "summary") ??
    "Verdict text was truncated; scores below were recovered from the partial response.";
  const bestArgP =
    extractJsonStringValue(raw, "best_arg_player") ?? "—";
  const bestArgO =
    extractJsonStringValue(raw, "best_arg_opponent") ?? "—";

  return {
    score_player: clampScore(Number(spM[1])),
    score_opponent: clampScore(Number(soM[1])),
    breakdown: { factual, logic, relevance, rhetoric },
    summary,
    best_arg_player: bestArgP,
    best_arg_opponent: bestArgO,
  };
}

function recoverVerdictWithoutBreakdown(raw: string): Verdict | null {
  const spM = /"score_player"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(raw);
  const soM = /"score_opponent"\s*:\s*(-?\d+(?:\.\d+)?)/.exec(raw);
  if (!spM || !soM) return null;

  const summary = extractJsonStringValue(raw, "summary");
  const bestArgP = extractJsonStringValue(raw, "best_arg_player");
  const bestArgO = extractJsonStringValue(raw, "best_arg_opponent");
  if (!summary || !bestArgP || !bestArgO) return null;

  const scorePlayer = clampScore(Number(spM[1]));
  const scoreOpponent = clampScore(Number(soM[1]));
  return {
    score_player: scorePlayer,
    score_opponent: scoreOpponent,
    breakdown: breakdownFromScores(scorePlayer, scoreOpponent),
    summary,
    best_arg_player: bestArgP,
    best_arg_opponent: bestArgO,
  };
}

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
        const partial = recoverVerdictFromPartialRaw(text);
        if (partial) return partial;
        const scoreOnly = recoverVerdictWithoutBreakdown(text);
        if (scoreOnly) return scoreOnly;
        continue;
      }
      const breakdown = normalizeBreakdown(parsed.breakdown);
      if (!breakdown) {
        const partial = recoverVerdictFromPartialRaw(text);
        if (partial) return partial;
        const bestArgP =
          typeof parsed.best_arg_player === "string" ? parsed.best_arg_player : null;
        const bestArgO =
          typeof parsed.best_arg_opponent === "string" ? parsed.best_arg_opponent : null;
        if (bestArgP && bestArgO) {
          const scorePlayer = clampScore(sp);
          const scoreOpponent = clampScore(so);
          return {
            score_player: scorePlayer,
            score_opponent: scoreOpponent,
            breakdown: breakdownFromScores(scorePlayer, scoreOpponent),
            summary: parsed.summary,
            best_arg_player: bestArgP,
            best_arg_opponent: bestArgO,
          };
        }
        continue;
      }
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
      const partial = recoverVerdictFromPartialRaw(text);
      if (partial) return partial;
      const scoreOnly = recoverVerdictWithoutBreakdown(text);
      if (scoreOnly) return scoreOnly;
    }
  }

  const recovered = recoverVerdictFromPartialRaw(trimmed);
  if (recovered) return recovered;
  const scoreOnly = recoverVerdictWithoutBreakdown(trimmed);
  if (scoreOnly) return scoreOnly;

  return VERDICT_PARSE_FALLBACK;
}
