import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptPrivateText,
  encryptPrivateText,
  hashSessionToken,
  hmacLookup,
} from "@/lib/auth/crypto";

const ORIGINAL_ENV = { ...process.env };

describe("auth crypto", () => {
  beforeEach(() => {
    process.env.AUTH_ENCRYPTION_KEY = "test-encryption-secret";
    process.env.AUTH_HASH_SECRET = "test-hash-secret";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("encrypts and decrypts private text without storing plaintext", () => {
    const encrypted = encryptPrivateText("arsenii@example.com");

    expect(encrypted).not.toContain("arsenii@example.com");
    expect(decryptPrivateText(encrypted)).toBe("arsenii@example.com");
  });

  it("uses randomized encryption and stable HMAC lookups", () => {
    const first = encryptPrivateText("same value");
    const second = encryptPrivateText("same value");

    expect(first).not.toBe(second);
    expect(hmacLookup("same@example.com")).toBe(hmacLookup("same@example.com"));
    expect(hashSessionToken("token-a")).not.toBe(hashSessionToken("token-b"));
  });
});

