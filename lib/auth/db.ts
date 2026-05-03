import Database from "better-sqlite3";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  decryptPrivateText,
  encryptPrivateText,
  hashSessionToken,
  hashVerificationCode,
  hmacLookup,
  safeEqualString,
} from "@/lib/auth/crypto";
import {
  normalizeDisplayName,
  normalizeEmail,
} from "@/lib/auth/email";
import type { AuthUser } from "@/lib/auth/types";

export const AUTH_SESSION_COOKIE = "debately_session";
export const AUTH_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;
const VERIFICATION_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

type UserRow = {
  id: string;
  email_hash: string;
  email_ciphertext: string;
  display_name_ciphertext: string | null;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type VerificationRow = {
  id: string;
  user_id: string;
  email_hash: string;
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
  attempts: number;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
};

type AuthDbState = {
  db: Database.Database;
};

const globalKey = Symbol.for("debately.authDb");
type GlobalWithAuthDb = typeof globalThis & {
  [globalKey]?: AuthDbState;
};

function getDbPath(): string {
  const explicit = process.env.AUTH_DB_PATH?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    return "/var/cache/debately/auth.sqlite";
  }
  return join(process.cwd(), ".data", "auth.sqlite");
}

function openAuthDb(): AuthDbState {
  const dbPath = getDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email_hash TEXT NOT NULL UNIQUE,
      email_ciphertext TEXT NOT NULL,
      display_name_ciphertext TEXT,
      email_verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_verification_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES auth_users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_auth_verification_codes_email
    ON auth_verification_codes(email_hash, created_at DESC);

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY(user_id) REFERENCES auth_users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token
    ON auth_sessions(token_hash);

    CREATE TABLE IF NOT EXISTS auth_user_data (
      user_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      payload_ciphertext TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, namespace),
      FOREIGN KEY(user_id) REFERENCES auth_users(id)
    );
  `);

  return { db };
}

function getAuthDb(): AuthDbState {
  const g = globalThis as GlobalWithAuthDb;
  if (g[globalKey]) return g[globalKey]!;
  const state = openAuthDb();
  g[globalKey] = state;
  return state;
}

function rowToUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: decryptPrivateText(row.email_ciphertext),
    displayName: row.display_name_ciphertext
      ? decryptPrivateText(row.display_name_ciphertext)
      : null,
    emailVerifiedAt: row.email_verified_at,
  };
}

export function generateVerificationCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

export function startEmailVerification({
  email,
  displayName,
}: {
  email: string;
  displayName?: string | null;
}): { userId: string; code: string; expiresAt: string } {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Invalid email.");
  const normalizedName = normalizeDisplayName(displayName);
  const emailHash = hmacLookup(normalizedEmail);
  const now = new Date().toISOString();
  const { db } = getAuthDb();

  let user = db
    .prepare("SELECT * FROM auth_users WHERE email_hash = ?")
    .get(emailHash) as UserRow | undefined;

  if (!user) {
    const userId = randomUUID();
    db.prepare(
      `
        INSERT INTO auth_users (
          id,
          email_hash,
          email_ciphertext,
          display_name_ciphertext,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      userId,
      emailHash,
      encryptPrivateText(normalizedEmail),
      normalizedName ? encryptPrivateText(normalizedName) : null,
      now,
      now,
    );
    user = db
      .prepare("SELECT * FROM auth_users WHERE id = ?")
      .get(userId) as UserRow;
  } else if (normalizedName) {
    db.prepare(
      `
        UPDATE auth_users
        SET display_name_ciphertext = ?, updated_at = ?
        WHERE id = ?
      `,
    ).run(encryptPrivateText(normalizedName), now, user.id);
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
  db.prepare(
    `
      INSERT INTO auth_verification_codes (
        id,
        user_id,
        email_hash,
        code_hash,
        expires_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    randomUUID(),
    user.id,
    emailHash,
    hashVerificationCode(normalizedEmail, code),
    expiresAt,
    now,
  );

  return { userId: user.id, code, expiresAt };
}

export function verifyEmailCode({
  email,
  code,
}: {
  email: string;
  code: string;
}): AuthUser {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = code.trim();
  if (!normalizedEmail || !/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Invalid code.");
  }

  const { db } = getAuthDb();
  const emailHash = hmacLookup(normalizedEmail);
  const row = db
    .prepare(
      `
        SELECT *
        FROM auth_verification_codes
        WHERE email_hash = ?
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
    .get(emailHash) as VerificationRow | undefined;

  if (!row) throw new Error("Code not found.");
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    throw new Error("Too many attempts. Request a new code.");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("Code expired.");
  }

  const expected = hashVerificationCode(normalizedEmail, normalizedCode);
  if (!safeEqualString(row.code_hash, expected)) {
    db.prepare(
      "UPDATE auth_verification_codes SET attempts = attempts + 1 WHERE id = ?",
    ).run(row.id);
    throw new Error("Code does not match.");
  }

  const now = new Date().toISOString();
  db.prepare(
    "UPDATE auth_verification_codes SET consumed_at = ? WHERE id = ?",
  ).run(now, row.id);
  db.prepare(
    `
      UPDATE auth_users
      SET email_verified_at = COALESCE(email_verified_at, ?),
          updated_at = ?
      WHERE id = ?
    `,
  ).run(now, now, row.user_id);

  const user = db
    .prepare("SELECT * FROM auth_users WHERE id = ?")
    .get(row.user_id) as UserRow | undefined;
  if (!user) throw new Error("User not found.");
  return rowToUser(user);
}

export function createSession(userId: string): {
  token: string;
  expiresAt: string;
} {
  const { db } = getAuthDb();
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + AUTH_SESSION_MAX_AGE_SEC * 1000,
  ).toISOString();
  db.prepare(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        token_hash,
        created_at,
        last_seen_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(randomUUID(), userId, hashSessionToken(token), now, now, expiresAt);
  return { token, expiresAt };
}

export function getUserBySessionToken(token: string | null): AuthUser | null {
  if (!token) return null;
  const { db } = getAuthDb();
  const session = db
    .prepare(
      `
        SELECT *
        FROM auth_sessions
        WHERE token_hash = ?
          AND revoked_at IS NULL
        LIMIT 1
      `,
    )
    .get(hashSessionToken(token)) as SessionRow | undefined;

  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const now = new Date().toISOString();
  db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(
    now,
    session.id,
  );

  const user = db
    .prepare("SELECT * FROM auth_users WHERE id = ?")
    .get(session.user_id) as UserRow | undefined;
  return user ? rowToUser(user) : null;
}

export function saveEncryptedUserDataForSession({
  token,
  namespace,
  payload,
}: {
  token: string | null;
  namespace: string;
  payload: unknown;
}): { userId: string; updatedAt: string } | null {
  if (!/^[a-z0-9:_-]{2,64}$/.test(namespace)) {
    throw new Error("Invalid data namespace.");
  }
  if (!token) return null;
  const { db } = getAuthDb();
  const session = db
    .prepare(
      `
        SELECT *
        FROM auth_sessions
        WHERE token_hash = ?
          AND revoked_at IS NULL
        LIMIT 1
      `,
    )
    .get(hashSessionToken(token)) as SessionRow | undefined;

  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    return null;
  }

  const json = JSON.stringify(payload);
  if (json.length > 64_000) {
    throw new Error("Encrypted payload is too large.");
  }

  const updatedAt = new Date().toISOString();
  db.prepare(
    `
      INSERT INTO auth_user_data (
        user_id,
        namespace,
        payload_ciphertext,
        updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, namespace) DO UPDATE SET
        payload_ciphertext = excluded.payload_ciphertext,
        updated_at = excluded.updated_at
    `,
  ).run(session.user_id, namespace, encryptPrivateText(json), updatedAt);

  return { userId: session.user_id, updatedAt };
}

export function revokeSessionToken(token: string | null): void {
  if (!token) return;
  const { db } = getAuthDb();
  db.prepare(
    `
      UPDATE auth_sessions
      SET revoked_at = ?
      WHERE token_hash = ?
        AND revoked_at IS NULL
    `,
  ).run(new Date().toISOString(), hashSessionToken(token));
}
