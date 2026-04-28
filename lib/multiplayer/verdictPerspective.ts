import type { Side } from "@/lib/types";
import type { Verdict } from "@/lib/types";
import type { PublicSession, SlotId } from "@/lib/multiplayer/types";

/** Swaps "player" and "opponent" axes in a verdict. */
function swapVerdict(verdict: Verdict): Verdict {
  return {
    ...verdict,
    score_player: verdict.score_opponent,
    score_opponent: verdict.score_player,
    best_arg_player: verdict.best_arg_opponent,
    best_arg_opponent: verdict.best_arg_player,
    breakdown: {
      factual: [verdict.breakdown.factual[1], verdict.breakdown.factual[0]],
      logic: [verdict.breakdown.logic[1], verdict.breakdown.logic[0]],
      relevance: [verdict.breakdown.relevance[1], verdict.breakdown.relevance[0]],
      rhetoric: [verdict.breakdown.rhetoric[1], verdict.breakdown.rhetoric[0]],
    },
  };
}

/**
 * Verdict from the judge is computed with `player` = whoever anchored the request (see `runVerdictForSession`).
 * Persisted sessions must always store scores as slot A = `score_player`, slot B = `score_opponent`,
 * matching `verdictInForAgainstOrder` and `session.players[0]` / `[1]`.
 */
export function normalizeVerdictToSlotA(
  verdict: Verdict,
  anchorSlot: SlotId,
): Verdict {
  return anchorSlot === "A" ? verdict : swapVerdict(verdict);
}

/**
 * Stored verdict uses judge order: `score_player` = session.players[0], `score_opponent` = players[1].
 * This maps to a consistent FOR/AGAINST order: `score_player` = FOR, `score_opponent` = AGAINST.
 */
export function verdictInForAgainstOrder(
  verdict: Verdict,
  session: Pick<PublicSession, "players">,
): Verdict {
  if (session.players[0].side === "FOR") return verdict;
  return swapVerdict(verdict);
}

/**
 * VerdictCard: `player` = this debater, `opponent` = the other. FOR debater = FOR as first column.
 */
export function verdictForDebatePlayer(
  verdict: Verdict,
  session: Pick<PublicSession, "players">,
  mySide: Side,
): Verdict {
  const forAgainst = verdictInForAgainstOrder(verdict, session);
  return mySide === "FOR" ? forAgainst : swapVerdict(forAgainst);
}
