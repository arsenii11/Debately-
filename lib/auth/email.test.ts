import { describe, expect, it } from "vitest";
import {
  maskEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "@/lib/auth/email";

describe("auth email helpers", () => {
  it("normalizes valid emails and rejects invalid ones", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
    expect(normalizeEmail("not-email")).toBeNull();
  });

  it("normalizes names and masks emails", () => {
    expect(normalizeDisplayName("  Arsenii   Dragunkin  ")).toBe(
      "Arsenii Dragunkin",
    );
    expect(maskEmail("arsenii@example.com")).toBe("ar*****@example.com");
  });
});

