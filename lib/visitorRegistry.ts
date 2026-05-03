import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeVisitorId } from "@/lib/visitorIdentity";

type VisitorRow = {
  visitor_id: string;
  first_seen_at: string;
  last_seen_at: string;
};

type TouchVisitorResult = {
  visitorId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isNew: boolean;
};

type VisitorRegistryState = {
  db: Database.Database;
};

const globalKey = Symbol.for("debately.visitorRegistry");
type GlobalWithRegistry = typeof globalThis & {
  [globalKey]?: VisitorRegistryState;
};

function getDbPath(): string {
  const explicit = process.env.VISITOR_REGISTRY_DB_PATH?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    return "/var/cache/debately/visitors.sqlite";
  }
  return join(process.cwd(), ".data", "visitors.sqlite");
}

function openRegistry(): VisitorRegistryState {
  const dbPath = getDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitor_registry (
      visitor_id TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_visitor_registry_last_seen_at
    ON visitor_registry(last_seen_at DESC);
  `);

  return { db };
}

function getRegistry(): VisitorRegistryState {
  const g = globalThis as GlobalWithRegistry;
  if (g[globalKey]) return g[globalKey]!;
  const state = openRegistry();
  g[globalKey] = state;
  return state;
}

export function touchVisitor(visitorId: string): TouchVisitorResult {
  const normalized = normalizeVisitorId(visitorId);
  if (!normalized) {
    throw new Error("Invalid visitor id.");
  }

  const { db } = getRegistry();
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `
        SELECT visitor_id, first_seen_at, last_seen_at
        FROM visitor_registry
        WHERE visitor_id = ?
      `,
    )
    .get(normalized) as VisitorRow | undefined;

  db.prepare(
    `
      INSERT INTO visitor_registry (
        visitor_id,
        first_seen_at,
        last_seen_at
      ) VALUES (?, ?, ?)
      ON CONFLICT(visitor_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at
    `,
  ).run(normalized, now, now);

  const saved = db
    .prepare(
      `
        SELECT visitor_id, first_seen_at, last_seen_at
        FROM visitor_registry
        WHERE visitor_id = ?
      `,
    )
    .get(normalized) as VisitorRow;

  return {
    visitorId: normalized,
    firstSeenAt: saved.first_seen_at,
    lastSeenAt: saved.last_seen_at,
    isNew: !existing,
  };
}
