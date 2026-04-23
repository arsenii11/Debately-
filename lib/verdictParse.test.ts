import { describe, expect, it } from "vitest";
import {
  isVerdictFallback,
  parseVerdictJson,
  recoverVerdictFromPartialRaw,
  VERDICT_PARSE_FALLBACK,
} from "@/lib/verdictParse";

const VALID_BREAKDOWN = {
  factual: [72, 61],
  logic: [68, 55],
  relevance: [80, 70],
  rhetoric: [60, 65],
};

function makeVerdictJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    score_player: 67,
    score_opponent: 58,
    breakdown: VALID_BREAKDOWN,
    summary: "Player argued consistently but lacked key evidence.",
    best_arg_player: "Remote work cuts commute time and improves focus.",
    best_arg_opponent: "In-person collaboration drives innovation.",
    ...overrides,
  });
}

describe("parseVerdictJson — valid input", () => {
  it("parses a clean valid verdict", () => {
    const v = parseVerdictJson(makeVerdictJson());
    expect(isVerdictFallback(v)).toBe(false);
    expect(v.score_player).toBe(67);
    expect(v.score_opponent).toBe(58);
    expect(v.summary).toContain("Player argued");
    expect(v.best_arg_player).toBeTruthy();
    expect(v.best_arg_opponent).toBeTruthy();
  });

  it("clamps scores above 100", () => {
    const v = parseVerdictJson(makeVerdictJson({ score_player: 110, score_opponent: 999 }));
    expect(isVerdictFallback(v)).toBe(false);
    expect(v.score_player).toBeLessThanOrEqual(100);
    expect(v.score_opponent).toBeLessThanOrEqual(100);
  });

  it("clamps scores below 0", () => {
    const v = parseVerdictJson(makeVerdictJson({ score_player: -5, score_opponent: -100 }));
    expect(isVerdictFallback(v)).toBe(false);
    expect(v.score_player).toBeGreaterThanOrEqual(0);
    expect(v.score_opponent).toBeGreaterThanOrEqual(0);
  });

  it("strips markdown fences", () => {
    const raw = "```json\n" + makeVerdictJson() + "\n```";
    const v = parseVerdictJson(raw);
    expect(isVerdictFallback(v)).toBe(false);
    expect(v.score_player).toBe(67);
  });

  it("extracts from trailing text after JSON", () => {
    const raw = makeVerdictJson() + "\n\nSome extra text the model added";
    const v = parseVerdictJson(raw);
    expect(isVerdictFallback(v)).toBe(false);
  });
});

describe("parseVerdictJson — breakdown normalisation", () => {
  it("normalises breakdown scores above 100", () => {
    const v = parseVerdictJson(
      makeVerdictJson({
        breakdown: {
          factual: [120, 50],
          logic: [68, 55],
          relevance: [80, 70],
          rhetoric: [60, 110],
        },
      }),
    );
    expect(isVerdictFallback(v)).toBe(false);
    expect(v.breakdown.factual[0]).toBeLessThanOrEqual(100);
    expect(v.breakdown.rhetoric[1]).toBeLessThanOrEqual(100);
  });

  it("returns fallback when a breakdown field is missing", () => {
    const obj = JSON.parse(makeVerdictJson()) as Record<string, unknown>;
    const bd = obj.breakdown as Record<string, unknown>;
    delete bd.logic;
    const v = parseVerdictJson(JSON.stringify(obj));
    expect(isVerdictFallback(v)).toBe(true);
  });

  it("returns fallback when breakdown pair has only one element", () => {
    const obj = JSON.parse(makeVerdictJson()) as Record<string, unknown>;
    (obj.breakdown as Record<string, unknown>).factual = [72];
    const v = parseVerdictJson(JSON.stringify(obj));
    expect(isVerdictFallback(v)).toBe(true);
  });
});

describe("parseVerdictJson — truncated/partial input", () => {
  it("recovers scores from partial JSON that ends mid-object", () => {
    const raw =
      '{"score_player":71,"score_opponent":55,"breakdown":{"factual":[71,55],"logic":[68,52],"relevance":[78,70],"rhetoric":[60,58]},"summary":"Partial summ';
    const v = parseVerdictJson(raw);
    expect(isVerdictFallback(v)).toBe(false);
    expect(v.score_player).toBe(71);
    expect(v.score_opponent).toBe(55);
  });

  it("returns fallback when no recognisable fields present", () => {
    const v = parseVerdictJson("hello world");
    expect(isVerdictFallback(v)).toBe(true);
  });

  it("returns fallback for empty string", () => {
    const v = parseVerdictJson("");
    expect(isVerdictFallback(v)).toBe(true);
  });
});

describe("recoverVerdictFromPartialRaw", () => {
  it("recovers when breakdown fields are present", () => {
    const raw =
      '"score_player":65,"score_opponent":70,"breakdown":{"factual":[65,70],"logic":[60,72],"relevance":[75,68],"rhetoric":[55,60]},"summary":"Good debate';
    const v = recoverVerdictFromPartialRaw(raw);
    expect(v).not.toBeNull();
    expect(v!.score_player).toBe(65);
    expect(v!.score_opponent).toBe(70);
  });

  it("returns null when score fields are missing", () => {
    expect(recoverVerdictFromPartialRaw("no scores here")).toBeNull();
  });

  it("returns null when score_player is missing but score_opponent present", () => {
    const raw = '"score_opponent":72,"breakdown":{"factual":[50,72],"logic":[50,70],"relevance":[50,68],"rhetoric":[50,60]}';
    expect(recoverVerdictFromPartialRaw(raw)).toBeNull();
  });
});

describe("isVerdictFallback", () => {
  it("identifies the fallback verdict", () => {
    expect(isVerdictFallback(VERDICT_PARSE_FALLBACK)).toBe(true);
  });

  it("does not flag a real verdict as fallback", () => {
    const v = parseVerdictJson(makeVerdictJson());
    expect(isVerdictFallback(v)).toBe(false);
  });
});
