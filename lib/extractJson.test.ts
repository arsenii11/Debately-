import { describe, expect, it } from "vitest";
import { extractBalancedJsonObject } from "@/lib/extractJson";

describe("extractBalancedJsonObject", () => {
  it("extracts a simple object", () => {
    expect(extractBalancedJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("extracts object preceded by whitespace/text", () => {
    expect(extractBalancedJsonObject('Here is: {"key":"value"}')).toBe('{"key":"value"}');
  });

  it("handles nested objects", () => {
    const s = '{"outer":{"inner":42},"x":1}';
    expect(extractBalancedJsonObject(s)).toBe(s);
  });

  it("stops at the first balanced closing brace", () => {
    const s = '{"a":1} {"b":2}';
    expect(extractBalancedJsonObject(s)).toBe('{"a":1}');
  });

  it("handles braces inside string values", () => {
    const s = '{"msg":"use {curly} here","n":5}';
    expect(extractBalancedJsonObject(s)).toBe(s);
  });

  it("handles escaped quotes inside strings", () => {
    const s = '{"q":"she said \\"hi\\""}';
    expect(extractBalancedJsonObject(s)).toBe(s);
  });

  it("handles arrays as values", () => {
    const s = '{"items":[1,2,3],"ok":true}';
    expect(extractBalancedJsonObject(s)).toBe(s);
  });

  it("returns null when no opening brace exists", () => {
    expect(extractBalancedJsonObject("no json here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractBalancedJsonObject("")).toBeNull();
  });

  it("returns null for unclosed brace", () => {
    expect(extractBalancedJsonObject('{"a":1')).toBeNull();
  });

  it("handles deeply nested structure", () => {
    const s = '{"a":{"b":{"c":{"d":1}}}}';
    expect(extractBalancedJsonObject(s)).toBe(s);
  });

  it("tolerates markdown fence prefix", () => {
    const raw = "```json\n{\"x\":99}\n```";
    const extracted = extractBalancedJsonObject(raw);
    expect(extracted).toBe('{"x":99}');
  });

  it("handles object at the very end of string", () => {
    expect(extractBalancedJsonObject('prefix {"z":0}')).toBe('{"z":0}');
  });

  it("handles empty object", () => {
    expect(extractBalancedJsonObject("{}")).toBe("{}");
  });
});
