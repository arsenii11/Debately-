import { describe, expect, it } from "vitest";
import {
  JUDGE_FACTCHECK_COMPACT_RETRY_SUFFIX,
  opponentSystemPrompt,
  opponentUserPrompt,
} from "@/lib/prompts";

describe("opponent prompts", () => {
  it("instructs Debately to keep opposing the player's assigned side", () => {
    const prompt = opponentSystemPrompt("FOR");
    expect(prompt).toContain("You argue FOR. The player argues AGAINST.");
    expect(prompt).toContain("Never switch to arguing AGAINST");
    expect(prompt).toContain("that's actually my side");
  });

  it("includes player side and weird-same-side handling in user prompt", () => {
    const prompt = opponentUserPrompt({
      topic: "Remote work should be mandatory",
      opponentSide: "AGAINST",
      playerSide: "FOR",
      currentRound: 1,
      totalRounds: 5,
      turnTimerSeconds: 120,
      transcript: "No prior rounds.",
      lastPlayerMove: "I think remote work should stay optional.",
    });

    expect(prompt).toContain("Your side: AGAINST");
    expect(prompt).toContain("Player's assigned side: FOR");
    expect(prompt).toContain("they are supposed to oppose you");
    expect(prompt).toContain("briefly point out that they");
    expect(prompt).toContain("are supposed to argue FOR");
  });
});

describe("factcheck retry suffix", () => {
  it("forces compact valid JSON on retry", () => {
    expect(JUDGE_FACTCHECK_COMPACT_RETRY_SUFFIX).toContain("ONE compact JSON object only");
    expect(JUDGE_FACTCHECK_COMPACT_RETRY_SUFFIX).toContain("No markdown fences");
  });
});
