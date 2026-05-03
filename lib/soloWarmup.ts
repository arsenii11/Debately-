import type { RoundData, Verdict } from "@/lib/types";

/** Post-onboarding: full difficulty. */
export type SoloWarmupTier = 0 | 1 | 2;

/** First completed solo debate → tier 1 next time; second → tier 2 thereafter. */
export function soloWarmupTierFromPriorDebates(priorCompleted: number): SoloWarmupTier {
  if (priorCompleted <= 0) return 0;
  if (priorCompleted === 1) return 1;
  return 2;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function totalPlayerWords(history: RoundData[]): number {
  let n = 0;
  for (const r of history) {
    const w = r.playerMove.trim().split(/\s+/).filter(Boolean).length;
    n += w;
  }
  return n;
}

function deriveTotals(bd: Verdict["breakdown"]): { sp: number; so: number } {
  const sp = Math.round(
    bd.factual[0] * 0.4 +
      bd.logic[0] * 0.25 +
      bd.relevance[0] * 0.2 +
      bd.rhetoric[0] * 0.15,
  );
  const so = Math.round(
    bd.factual[1] * 0.4 +
      bd.logic[1] * 0.25 +
      bd.relevance[1] * 0.2 +
      bd.rhetoric[1] * 0.15,
  );
  return { sp, so };
}

/**
 * Slight score skew + softer opponent (via prompt) for the first solo matches.
 * Skipped when the player barely participated (no free wins on empty spam).
 */
export function applySoloWarmupVerdictBias(
  verdict: Verdict,
  tier: SoloWarmupTier,
  history: RoundData[],
): Verdict {
  if (tier >= 2) return verdict;
  if (totalPlayerWords(history) < 12) return verdict;

  const skew = tier === 0 ? 8 : 4;
  const bd = verdict.breakdown;
  const adj = (ps: number, os: number): [number, number] => [
    clampScore(ps + skew),
    clampScore(os - skew),
  ];
  const newBreakdown: Verdict["breakdown"] = {
    factual: adj(bd.factual[0], bd.factual[1]),
    logic: adj(bd.logic[0], bd.logic[1]),
    relevance: adj(bd.relevance[0], bd.relevance[1]),
    rhetoric: adj(bd.rhetoric[0], bd.rhetoric[1]),
  };
  let { sp, so } = deriveTotals(newBreakdown);
  sp = clampScore(sp);
  so = clampScore(so);

  if (tier === 0 && sp <= so) {
    const lift = Math.min(12, so - sp + 4);
    sp = clampScore(sp + lift);
    so = clampScore(so - Math.floor(lift * 0.65));
  } else if (tier === 1 && so - sp <= 3 && sp <= so) {
    sp = clampScore(sp + 3);
    so = clampScore(so - 2);
  }

  return {
    ...verdict,
    breakdown: newBreakdown,
    score_player: sp,
    score_opponent: so,
  };
}
