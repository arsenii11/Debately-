import { describe, expect, it } from "vitest";
import { clampFactcheckArgumentScore } from "@/lib/factcheckScoreAdjust";
import type { FactCheck } from "@/lib/types";

function fc(
  statuses: Array<"verified" | "disputed" | "false">,
  relevance: number,
): FactCheck {
  return {
    facts: statuses.map((status, i) => ({
      claim: `Claim ${i + 1}`,
      status,
      comment: "Some comment.",
    })),
    relevance,
    flags: [],
    flag_details: [],
  };
}

describe("clampFactcheckArgumentScore", () => {
  it("does not reduce score when all claims are verified", () => {
    const result = clampFactcheckArgumentScore(fc(["verified", "verified"], 90));
    expect(result.relevance).toBe(90);
  });

  it("caps at 22 when all claims are false", () => {
    const result = clampFactcheckArgumentScore(fc(["false", "false"], 80));
    expect(result.relevance).toBe(22);
  });

  it("keeps score at or below 22 when all false and score is already low", () => {
    const result = clampFactcheckArgumentScore(fc(["false"], 15));
    expect(result.relevance).toBe(15);
  });

  it("caps at 45 when some claims are false", () => {
    const result = clampFactcheckArgumentScore(fc(["false", "disputed", "verified"], 75));
    expect(result.relevance).toBe(45);
  });

  it("caps at 40 when no claims are verified (all disputed)", () => {
    const result = clampFactcheckArgumentScore(fc(["disputed", "disputed"], 60));
    expect(result.relevance).toBe(40);
  });

  it("caps at 72 when some but not all claims are verified", () => {
    const result = clampFactcheckArgumentScore(fc(["verified", "disputed"], 85));
    expect(result.relevance).toBe(72);
  });

  it("returns unchanged object when relevance is already below cap", () => {
    const input = fc(["false", "false"], 10);
    const result = clampFactcheckArgumentScore(input);
    expect(result).toBe(input);
  });

  it("returns a new object when relevance was clamped", () => {
    const input = fc(["false"], 90);
    const result = clampFactcheckArgumentScore(input);
    expect(result).not.toBe(input);
    expect(result.relevance).toBeLessThan(90);
  });

  it("returns unchanged when facts array is empty", () => {
    const input: FactCheck = { facts: [], relevance: 99, flags: [], flag_details: [] };
    expect(clampFactcheckArgumentScore(input)).toBe(input);
  });

  it("single false claim caps at 22", () => {
    expect(clampFactcheckArgumentScore(fc(["false"], 70)).relevance).toBe(22);
  });

  it("single verified claim applies no cap", () => {
    expect(clampFactcheckArgumentScore(fc(["verified"], 95)).relevance).toBe(95);
  });

  it("three claims: two disputed one verified — cap at 72", () => {
    const result = clampFactcheckArgumentScore(fc(["verified", "disputed", "disputed"], 80));
    expect(result.relevance).toBe(72);
  });
});
