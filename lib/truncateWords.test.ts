import { describe, expect, it } from "vitest";
import { countWords, truncateToMaxWords } from "@/lib/truncateWords";

describe("countWords", () => {
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(countWords("   \t\n  ")).toBe(0);
  });

  it("counts a single word", () => {
    expect(countWords("hello")).toBe(1);
  });

  it("counts multiple words separated by single spaces", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("counts words separated by multiple spaces/tabs", () => {
    expect(countWords("one   two\tthree")).toBe(3);
  });

  it("counts words in a full sentence", () => {
    expect(countWords("Remote work is better than working from the office")).toBe(9);
  });

  it("does not count leading/trailing whitespace as words", () => {
    expect(countWords("  hello world  ")).toBe(2);
  });
});

describe("truncateToMaxWords", () => {
  it("returns empty string unchanged", () => {
    expect(truncateToMaxWords("", 5)).toBe("");
  });

  it("returns text unchanged when under the limit", () => {
    expect(truncateToMaxWords("short text", 10)).toBe("short text");
  });

  it("returns text unchanged when exactly at the limit", () => {
    const text = "one two three four five";
    expect(truncateToMaxWords(text, 5)).toBe(text);
  });

  it("truncates and appends ellipsis when over the limit", () => {
    const result = truncateToMaxWords("one two three four five six", 3);
    expect(result).toBe("one two three…");
  });

  it("truncates to 1 word", () => {
    expect(truncateToMaxWords("alpha beta gamma", 1)).toBe("alpha…");
  });

  it("preserves whitespace inside the kept portion", () => {
    const text = "Remote  work  is  great  today";
    const result = truncateToMaxWords(text, 3);
    expect(result).toContain("Remote");
    expect(result.endsWith("…")).toBe(true);
  });

  it("trims leading/trailing whitespace before counting", () => {
    const result = truncateToMaxWords("  a b c d e  ", 3);
    expect(result).toBe("a b c…");
  });
});
