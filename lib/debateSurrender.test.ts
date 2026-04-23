import { describe, expect, it } from "vitest";
import { buildSurrenderRound, SURRENDER_PLAYER_MOVE } from "@/lib/debateSurrender";

describe("SURRENDER_PLAYER_MOVE", () => {
  it("is a non-empty string", () => {
    expect(typeof SURRENDER_PLAYER_MOVE).toBe("string");
    expect(SURRENDER_PLAYER_MOVE.length).toBeGreaterThan(0);
  });

  it("looks like a bracketed machine-readable marker", () => {
    expect(SURRENDER_PLAYER_MOVE).toMatch(/^\[.+\]$/);
  });
});

describe("buildSurrenderRound", () => {
  it("returns a RoundData with the correct round number", () => {
    const r = buildSurrenderRound(3);
    expect(r.round).toBe(3);
  });

  it("uses the surrender player move constant", () => {
    const r = buildSurrenderRound(1);
    expect(r.playerMove).toBe(SURRENDER_PLAYER_MOVE);
  });

  it("has a non-empty opponent move", () => {
    const r = buildSurrenderRound(2);
    expect(typeof r.opponentMove).toBe("string");
    expect((r.opponentMove ?? "").length).toBeGreaterThan(0);
  });

  it("includes a player factcheck with relevance 0", () => {
    const r = buildSurrenderRound(1);
    expect(r.aiFactcheckPlayer).not.toBeNull();
    expect(r.aiFactcheckPlayer!.relevance).toBe(0);
  });

  it("includes an opponent factcheck with high relevance", () => {
    const r = buildSurrenderRound(1);
    expect(r.aiFactcheckOpponent).not.toBeNull();
    expect(r.aiFactcheckOpponent!.relevance).toBeGreaterThan(50);
  });

  it("player factcheck has exactly one fact", () => {
    const r = buildSurrenderRound(1);
    expect(r.aiFactcheckPlayer!.facts.length).toBe(1);
  });

  it("player factcheck fact has status verified", () => {
    const r = buildSurrenderRound(1);
    expect(r.aiFactcheckPlayer!.facts[0]!.status).toBe("verified");
  });

  it("builds different round numbers correctly", () => {
    [1, 3, 7, 10].forEach((n) => {
      expect(buildSurrenderRound(n).round).toBe(n);
    });
  });
});
