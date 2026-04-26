import { describe, expect, it } from "vitest";
import type { Verdict } from "@/lib/types";
import type { PublicSession } from "@/lib/multiplayer/types";
import {
  verdictForDebatePlayer,
  verdictInForAgainstOrder,
} from "./verdictPerspective";

const V: Verdict = {
  score_player: 70,
  score_opponent: 55,
  breakdown: {
    factual: [72, 58],
    logic: [68, 60],
    relevance: [75, 52],
    rhetoric: [65, 62],
  },
  summary: "s",
  best_arg_player: "bp",
  best_arg_opponent: "bo",
};

function session(order: "FOR_FIRST" | "AGAINST_FIRST"): Pick<PublicSession, "players"> {
  if (order === "FOR_FIRST") {
    return {
      players: [
        { side: "FOR", slot: "A" },
        { side: "AGAINST", slot: "B" },
      ],
    } as Pick<PublicSession, "players">;
  }
  return {
    players: [
      { side: "AGAINST", slot: "A" },
      { side: "FOR", slot: "B" },
    ],
  } as Pick<PublicSession, "players">;
}

describe("verdictInForAgainstOrder", () => {
  it("leaves order when FOR is slot0", () => {
    expect(verdictInForAgainstOrder(V, session("FOR_FIRST"))).toEqual(V);
  });

  it("swaps when AGAINST is slot0 so FOR remains score_player", () => {
    const out = verdictInForAgainstOrder(V, session("AGAINST_FIRST"));
    expect(out.score_player).toBe(55);
    expect(out.score_opponent).toBe(70);
    expect(out.best_arg_player).toBe("bo");
  });
});

describe("verdictForDebatePlayer", () => {
  it("FOR debater gets FOR/AGAINST-ordered view", () => {
    const out = verdictForDebatePlayer(V, session("AGAINST_FIRST"), "FOR");
    expect(out.score_player).toBe(55);
    expect(out.score_opponent).toBe(70);
  });

  it("AGAINST debater has their score in score_player", () => {
    const out = verdictForDebatePlayer(V, session("AGAINST_FIRST"), "AGAINST");
    expect(out.score_player).toBe(70);
    expect(out.score_opponent).toBe(55);
  });
});
