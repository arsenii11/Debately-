import { SURRENDER_PLAYER_MOVE } from "@/lib/debateSurrender";
import { countWords } from "@/lib/truncateWords";
import type { RoundData } from "@/lib/types";

const OPPONENT_FAILURE_SUBSTR = "AI opponent failed to respond";

/** If any move is this short, that side's final score cannot exceed this. */
const SHORT_MOVE_MAX_WORDS = 25;
export const SHORT_ANSWER_SCORE_CEILING = 70;
export const COMPLETENESS_SCORE_BONUS_CAP = 10;

function penaltyForMove(text: string): number {
  const t = text.trim();
  if (!t) return 14;
  if (t === SURRENDER_PLAYER_MOVE) return 0;
  if (t.includes(OPPONENT_FAILURE_SUBSTR)) return 0;
  const w = countWords(t);
  if (w <= 4) return 12;
  if (w <= 10) return 8;
  if (w <= 20) return 4;
  if (w <= 35) return 2;
  return 0;
}

function completenessBonusForMove(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  if (t === SURRENDER_PLAYER_MOVE) return 0;
  if (t.includes(OPPONENT_FAILURE_SUBSTR)) return 0;
  const w = countWords(t);
  if (w < 40) return 0;
  if (w < 70) return 2;
  if (w < 110) return 4;
  return 6;
}

function moveCountsAsShortForCeiling(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t === SURRENDER_PLAYER_MOVE) return false;
  if (t.includes(OPPONENT_FAILURE_SUBSTR)) return false;
  return countWords(t) <= SHORT_MOVE_MAX_WORDS;
}

/** Per-side ceiling when at least one turn is too short (after penalties). */
export function shortAnswerScoreCeilings(history: RoundData[]): {
  playerMax: number;
  opponentMax: number;
} {
  let playerShort = false;
  let opponentShort = false;
  for (const r of history) {
    if (moveCountsAsShortForCeiling(r.playerMove)) playerShort = true;
    if (moveCountsAsShortForCeiling(r.opponentMove ?? "")) opponentShort = true;
  }
  return {
    playerMax: playerShort ? SHORT_ANSWER_SCORE_CEILING : 100,
    opponentMax: opponentShort ? SHORT_ANSWER_SCORE_CEILING : 100,
  };
}

/** Deduct from final scores; capped so one bad round does not zero everything. */
export function shortAnswerScorePenalties(history: RoundData[]): {
  player: number;
  opponent: number;
} {
  let player = 0;
  let opponent = 0;
  for (const r of history) {
    player += penaltyForMove(r.playerMove);
    opponent += penaltyForMove(r.opponentMove ?? "");
  }
  return {
    player: Math.min(40, player),
    opponent: Math.min(40, opponent),
  };
}

/** Reward developed turns so terse slogans are not the optimal scoring strategy. */
export function argumentCompletenessScoreBonuses(history: RoundData[]): {
  player: number;
  opponent: number;
} {
  let player = 0;
  let opponent = 0;
  for (const r of history) {
    player += completenessBonusForMove(r.playerMove);
    opponent += completenessBonusForMove(r.opponentMove ?? "");
  }
  return {
    player: Math.min(COMPLETENESS_SCORE_BONUS_CAP, player),
    opponent: Math.min(COMPLETENESS_SCORE_BONUS_CAP, opponent),
  };
}
