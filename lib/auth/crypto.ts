import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ENCRYPTION_PREFIX = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function decodeKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Empty auth secret.");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    /* fall through to passphrase hashing */
  }

  return createHash("sha256").update(trimmed).digest();
}

function readSecret(name: string, fallbackName?: string): Buffer {
  const raw = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : "");
  if (raw) return decodeKey(raw);

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set in production.`);
  }

  return createHash("sha256")
    .update(`debately-dev-${name}-do-not-use-in-production`)
    .digest();
}

function encryptionKey(): Buffer {
  return readSecret("AUTH_ENCRYPTION_KEY", "AUTH_SECRET");
}

function hashKey(): Buffer {
  return readSecret("AUTH_HASH_SECRET", "AUTH_SECRET");
}

export function encryptPrivateText(value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv, {
    authTagLength: TAG_BYTES,
  });
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptPrivateText(payload: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (
    version !== ENCRYPTION_PREFIX ||
    !ivRaw ||
    !tagRaw ||
    !encryptedRaw
  ) {
    throw new Error("Invalid encrypted payload.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
    { authTagLength: TAG_BYTES },
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hmacLookup(value: string): string {
  return createHmac("sha256", hashKey()).update(value).digest("base64url");
}

export function hashVerificationCode(email: string, code: string): string {
  return hmacLookup(`verify:${email}:${code}`);
}

export function hashSessionToken(token: string): string {
  return hmacLookup(`session:${token}`);
}

export function safeEqualString(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

