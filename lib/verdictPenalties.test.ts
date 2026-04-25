import { describe, expect, it } from "vitest";
import {
  argumentCompletenessScoreBonuses,
  COMPLETENESS_SCORE_BONUS_CAP,
  shortAnswerScoreCeilings,
  shortAnswerScorePenalties,
  SHORT_ANSWER_SCORE_CEILING,
} from "@/lib/verdictPenalties";
import { SURRENDER_PLAYER_MOVE } from "@/lib/debateSurrender";
import type { RoundData } from "@/lib/types";

function round(
  playerMove: string,
  opponentMove: string | null = null,
  n = 1,
): RoundData {
  return {
    round: n,
    playerMove,
    aiFactcheckPlayer: null,
    opponentMove,
    aiFactcheckOpponent: null,
  };
}

const LONG_MOVE =
  "Remote work significantly reduces commute times and associated stress, allowing employees to allocate that saved time to productive tasks or rest. Studies from Stanford suggest productivity can increase by 13% when workers operate from home due to fewer distractions.";

const DEVELOPED_MOVE =
  "AI coding matters more than memorizing syntax because the bottleneck is shifting from typing code to framing the right task. A developer still needs fundamentals, but the practical advantage now comes from decomposing problems, reviewing generated output, testing edge cases, and knowing when the model is confidently wrong. That makes AI literacy a multiplier rather than a replacement for engineering judgment.";

describe("shortAnswerScoreCeilings", () => {
  it("no ceiling when all moves are long", () => {
    const history = [round(LONG_MOVE, LONG_MOVE)];
    const { playerMax, opponentMax } = shortAnswerScoreCeilings(history);
    expect(playerMax).toBe(100);
    expect(opponentMax).toBe(100);
  });

  it("caps player when player has a short move", () => {
    const history = [round("Yes it is.", LONG_MOVE)];
    const { playerMax, opponentMax } = shortAnswerScoreCeilings(history);
    expect(playerMax).toBe(SHORT_ANSWER_SCORE_CEILING);
    expect(opponentMax).toBe(100);
  });

  it("caps opponent when opponent has a short move", () => {
    const history = [round(LONG_MOVE, "No it isn't.")];
    const { playerMax, opponentMax } = shortAnswerScoreCeilings(history);
    expect(playerMax).toBe(100);
    expect(opponentMax).toBe(SHORT_ANSWER_SCORE_CEILING);
  });

  it("caps both when both have short moves", () => {
    const history = [round("Short.", "Short.")];
    const { playerMax, opponentMax } = shortAnswerScoreCeilings(history);
    expect(playerMax).toBe(SHORT_ANSWER_SCORE_CEILING);
    expect(opponentMax).toBe(SHORT_ANSWER_SCORE_CEILING);
  });

  it("one short round in multi-round history triggers ceiling", () => {
    const history = [
      round(LONG_MOVE, LONG_MOVE, 1),
      round("Fine.", LONG_MOVE, 2),
      round(LONG_MOVE, LONG_MOVE, 3),
    ];
    const { playerMax } = shortAnswerScoreCeilings(history);
    expect(playerMax).toBe(SHORT_ANSWER_SCORE_CEILING);
  });

  it("empty history → no ceiling", () => {
    const { playerMax, opponentMax } = shortAnswerScoreCeilings([]);
    expect(playerMax).toBe(100);
    expect(opponentMax).toBe(100);
  });

  it("surrender move does NOT trigger player ceiling", () => {
    const history = [round(SURRENDER_PLAYER_MOVE, LONG_MOVE)];
    const { playerMax } = shortAnswerScoreCeilings(history);
    expect(playerMax).toBe(100);
  });

  it("null opponent move counts as empty (short) → triggers ceiling", () => {
    // null coerces to "" which has 0 words — correctly treated as short.
    const history = [round(LONG_MOVE, null)];
    const { opponentMax } = shortAnswerScoreCeilings(history);
    expect(opponentMax).toBe(SHORT_ANSWER_SCORE_CEILING);
  });
});

describe("shortAnswerScorePenalties", () => {
  it("zero penalty for long moves", () => {
    const history = [round(LONG_MOVE, LONG_MOVE)];
    const pen = shortAnswerScorePenalties(history);
    expect(pen.player).toBe(0);
    expect(pen.opponent).toBe(0);
  });

  it("heavy penalty for empty player move", () => {
    const history = [round("", LONG_MOVE)];
    expect(shortAnswerScorePenalties(history).player).toBeGreaterThan(10);
  });

  it("moderate penalty for a ~5-word player move", () => {
    const history = [round("Yes I agree with this.", LONG_MOVE)];
    const pen = shortAnswerScorePenalties(history);
    expect(pen.player).toBeGreaterThan(0);
    expect(pen.player).toBeLessThan(15);
  });

  it("penalties accumulate across rounds but are capped at 40", () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      round("ok", "ok", i + 1),
    );
    const pen = shortAnswerScorePenalties(history);
    expect(pen.player).toBe(40);
    expect(pen.opponent).toBe(40);
  });

  it("surrender move incurs zero penalty", () => {
    const history = [round(SURRENDER_PLAYER_MOVE, LONG_MOVE)];
    expect(shortAnswerScorePenalties(history).player).toBe(0);
  });

  it("each penalty bracket is applied correctly", () => {
    // <= 4 words → 12
    expect(shortAnswerScorePenalties([round("a b c d", LONG_MOVE)]).player).toBe(12);
    // <= 10 words → 8
    expect(shortAnswerScorePenalties([round("one two three four five six seven", LONG_MOVE)]).player).toBe(8);
  });
});

describe("argumentCompletenessScoreBonuses", () => {
  it("gives no bonus for short slogans", () => {
    const history = [round("AI coding matters more than coding skill.", LONG_MOVE)];
    const bonus = argumentCompletenessScoreBonuses(history);
    expect(bonus.player).toBe(0);
  });

  it("rewards a developed player argument", () => {
    const bonus = argumentCompletenessScoreBonuses([round(DEVELOPED_MOVE, LONG_MOVE)]);
    expect(bonus.player).toBeGreaterThan(0);
  });

  it("caps accumulated bonuses", () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      round(DEVELOPED_MOVE, DEVELOPED_MOVE, i + 1),
    );
    const bonus = argumentCompletenessScoreBonuses(history);
    expect(bonus.player).toBe(COMPLETENESS_SCORE_BONUS_CAP);
    expect(bonus.opponent).toBe(COMPLETENESS_SCORE_BONUS_CAP);
  });

  it("does not reward surrender", () => {
    const bonus = argumentCompletenessScoreBonuses([
      round(SURRENDER_PLAYER_MOVE, LONG_MOVE),
    ]);
    expect(bonus.player).toBe(0);
  });
});
