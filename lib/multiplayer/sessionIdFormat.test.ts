import { describe, expect, it } from "vitest";
import { generateSessionId } from "@/lib/multiplayer/sessionLogic";
import {
  SESSION_ID_LENGTH,
  isPlausibleSessionId,
  messageFromErrorBody,
} from "@/lib/multiplayer/sessionIdFormat";

describe("isPlausibleSessionId", () => {
  it("accepts generated ids", () => {
    for (let i = 0; i < 20; i++) {
      const id = generateSessionId();
      expect(id).toHaveLength(SESSION_ID_LENGTH);
      expect(isPlausibleSessionId(id)).toBe(true);
    }
  });

  it("rejects common typos and bad lengths", () => {
    expect(isPlausibleSessionId("")).toBe(false);
    expect(isPlausibleSessionId("1")).toBe(false);
    expect(isPlausibleSessionId("O")).toBe(false);
    expect(isPlausibleSessionId("0")).toBe(false);
    expect(isPlausibleSessionId("I")).toBe(false);
    expect(isPlausibleSessionId("L")).toBe(false);
    expect(isPlausibleSessionId("123456789")).toBe(false);
    expect(isPlausibleSessionId("12345678901")).toBe(false);
  });

  it("trims whitespace", () => {
    const id = generateSessionId();
    expect(isPlausibleSessionId(`  ${id}  `)).toBe(true);
  });
});

describe("messageFromErrorBody", () => {
  it("uses message from JSON", () => {
    expect(
      messageFromErrorBody('{"message":"x"}', 404, "f"),
    ).toBe("x");
  });

  it("falls back by status", () => {
    expect(
      messageFromErrorBody("not json", 400, "f"),
    ).toMatch(/valid/);
  });
});
