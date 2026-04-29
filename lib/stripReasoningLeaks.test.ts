import { describe, expect, it } from "vitest";
import { stripReasoningLeaks } from "./stripReasoningLeaks";

describe("stripReasoningLeaks", () => {
  it("cuts after [Thoughts]:", () => {
    const a =
      String.raw`{"text":"Hello"}` +
      " [Thoughts]: The user said x. I will say y. Hello";
    expect(stripReasoningLeaks(a)).toBe('{"text":"Hello"}');
  });

  it("leaves clean JSON only string unchanged", () => {
    const j = '{"text":"ok"}';
    expect(stripReasoningLeaks(j)).toBe(j);
  });
});
