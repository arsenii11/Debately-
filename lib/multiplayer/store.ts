import { EventEmitter } from "node:events";
import { promises as fsp, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { debatelyLog } from "@/lib/debatelyLog";
import {
  getRedisClient,
  getRedisSubscriber,
  isRedisConfigured,
} from "@/lib/redis";
import {
  DEFAULT_SESSION_TTL_MS,
  applyFactcheck,
  createEmptySession,
  findSlotByTokenHash,
  generatePlayerToken,
  getSlot,
  hashPlayerToken,
  isDeadlineExpired,
  joinSession,
  recordMove,
  recordComposerDraft,
  recordConcede,
  recordLike,
  removeLike,
  consumeHint,
  setVerdict,
  touchPresence,
  tryStartLive,
  updateLobby,
} from "@/lib/multiplayer/sessionLogic";
import {
  SPEC_REACTION_KINDS,
  type MultiplayerSession,
  type PublicSession,
  type SlotId,
  type SpecLike,
  type SpecReactionKind,
} from "@/lib/multiplayer/types";
import type { FactCheck, Verdict } from "@/lib/types";

const SNAPSHOT_INTERVAL_MS = 5_000;
const MAX_SESSIONS = 5_000;
const DEFAULT_SNAPSHOT_PATH = "/var/cache/debately/sessions.json";
const REDIS_SESSION_PREFIX = "debately:session:";
const REDIS_SESSION_LOCK_PREFIX = "debately:session-lock:";
const REDIS_SESSION_CHANNEL_PREFIX = "debately:session-events:";
const REDIS_LOCK_TTL_MS = 5_000;
const REDIS_LOCK_WAIT_MS = 2_500;

type Snapshot = {
  v: 1;
  sessions: MultiplayerSession[];
};

type StoreState = {
  sessions: Map<string, MultiplayerSession>;
  emitter: EventEmitter;
  dirty: boolean;
  snapshotPath: string;
  intervalId: NodeJS.Timeout | null;
  shutdownHandlersInstalled: boolean;
};

const globalKey = Symbol.for("debately.multiplayerStore");
type GlobalWithStore = typeof globalThis & { [globalKey]?: StoreState };

function getSnapshotPath(): string {
  const raw = process.env.MULTIPLAYER_SNAPSHOT_PATH?.trim();
  if (raw && raw.length > 0) return raw;
  return DEFAULT_SNAPSHOT_PATH;
}

function loadInitialSessions(path: string): Map<string, MultiplayerSession> {
  const map = new Map<string, MultiplayerSession>();
  try {
    const raw = readFileSync(path, "utf8");
    if (!raw.trim()) return map;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.sessions)) return map;
    const now = Date.now();
    for (const s of parsed.sessions) {
      if (!s || typeof s !== "object") continue;
      if (typeof s.id !== "string") continue;
      if (typeof s.expiresAt !== "number" || s.expiresAt < now) continue;
      map.set(s.id, s);
    }
    debatelyLog("gemini", "info", "multiplayer snapshot loaded", {
      sessions: map.size,
      path,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code !== "ENOENT") {
      debatelyLog("gemini", "warn", "multiplayer snapshot read failed", {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return map;
}

function ensureStore(): StoreState {
  const g = globalThis as GlobalWithStore;
  if (g[globalKey]) return g[globalKey]!;

  const snapshotPath = getSnapshotPath();
  const state: StoreState = {
    sessions: loadInitialSessions(snapshotPath),
    emitter: new EventEmitter(),
    dirty: false,
    snapshotPath,
    intervalId: null,
    shutdownHandlersInstalled: false,
  };
  // Many concurrent SSE listeners are expected.
  state.emitter.setMaxListeners(0);
  g[globalKey] = state;

  startSnapshotLoop(state);
  installShutdownHandlers(state);
  return state;
}

async function persistNow(state: StoreState): Promise<void> {
  if (!state.dirty) return;
  const snapshot: Snapshot = {
    v: 1,
    sessions: Array.from(state.sessions.values()),
  };
  const data = JSON.stringify(snapshot);
  try {
    mkdirSync(dirname(state.snapshotPath), { recursive: true });
  } catch {
    /* ignore */
  }
  try {
    const tmp = `${state.snapshotPath}.tmp`;
    await fsp.writeFile(tmp, data, "utf8");
    await fsp.rename(tmp, state.snapshotPath);
    state.dirty = false;
  } catch (err) {
    debatelyLog("gemini", "warn", "multiplayer snapshot write failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

function startSnapshotLoop(state: StoreState): void {
  if (state.intervalId) return;
  state.intervalId = setInterval(() => {
    void persistNow(state);
  }, SNAPSHOT_INTERVAL_MS);
  if (typeof state.intervalId.unref === "function") {
    state.intervalId.unref();
  }
}

function installShutdownHandlers(state: StoreState): void {
  if (state.shutdownHandlersInstalled) return;
  state.shutdownHandlersInstalled = true;
  const handler = () => {
    void persistNow(state);
  };
  process.on("beforeExit", handler);
  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
}

function evictExpired(state: StoreState, now: number): void {
  for (const [id, session] of state.sessions) {
    if (session.expiresAt < now) {
      state.sessions.delete(id);
      state.dirty = true;
    }
  }
  if (state.sessions.size > MAX_SESSIONS) {
    // LRU eviction by updatedAt ascending.
    const entries = Array.from(state.sessions.values()).sort(
      (a, b) => a.updatedAt - b.updatedAt,
    );
    const toEvict = state.sessions.size - MAX_SESSIONS;
    for (let i = 0; i < toEvict; i++) {
      const victim = entries[i];
      if (!victim) break;
      state.sessions.delete(victim.id);
      state.dirty = true;
    }
  }
}

function commit(
  state: StoreState,
  next: MultiplayerSession,
): MultiplayerSession {
  state.sessions.set(next.id, next);
  state.dirty = true;
  state.emitter.emit(`change:${next.id}`, next);
  return next;
}

function normalizeLikeEntry(l: SpecLike): SpecLike {
  const raw = (l as SpecLike & { kind?: SpecReactionKind }).kind;
  const kind =
    raw && SPEC_REACTION_KINDS.includes(raw) ? raw : "like";
  return { name: l.name, round: l.round, side: l.side, at: l.at, kind };
}

function redisSessionKey(id: string): string {
  return `${REDIS_SESSION_PREFIX}${id}`;
}

function redisSessionLockKey(id: string): string {
  return `${REDIS_SESSION_LOCK_PREFIX}${id}`;
}

function redisSessionChannel(id: string): string {
  return `${REDIS_SESSION_CHANNEL_PREFIX}${id}`;
}

function redisSessionTtlMs(session: MultiplayerSession, now = Date.now()): number {
  return Math.max(1_000, session.expiresAt - now);
}

function parseRedisSession(raw: string | null, id?: string): MultiplayerSession | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as MultiplayerSession;
    if (!session || typeof session !== "object") return null;
    if (typeof session.id !== "string") return null;
    if (id && session.id !== id) return null;
    if (typeof session.expiresAt !== "number" || session.expiresAt < Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

async function publishRedisSession(session: MultiplayerSession): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  await client.publish(redisSessionChannel(session.id), JSON.stringify(session));
}

async function redisReadSession(id: string): Promise<MultiplayerSession | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const session = parseRedisSession(await client.get(redisSessionKey(id)), id);
  if (!session) {
    await client.del(redisSessionKey(id)).catch(() => undefined);
  }
  return session;
}

async function redisWriteSession(
  session: MultiplayerSession,
  mode: "create" | "update",
): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;
  const args =
    mode === "create"
      ? ({
          PX: redisSessionTtlMs(session),
          NX: true,
        } as const)
      : ({
          PX: redisSessionTtlMs(session),
        } as const);
  const result = await client.set(
    redisSessionKey(session.id),
    JSON.stringify(session),
    args,
  );
  const ok = mode === "update" ? result === "OK" : result === "OK";
  if (ok) await publishRedisSession(session);
  return ok;
}

async function acquireRedisSessionLock(sessionId: string): Promise<string | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const token = generatePlayerToken();
  const deadline = Date.now() + REDIS_LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const result = await client.set(redisSessionLockKey(sessionId), token, {
      NX: true,
      PX: REDIS_LOCK_TTL_MS,
    });
    if (result === "OK") return token;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return null;
}

async function releaseRedisSessionLock(
  sessionId: string,
  token: string,
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  await client
    .eval(
      `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
      {
        keys: [redisSessionLockKey(sessionId)],
        arguments: [token],
      },
    )
    .catch(() => undefined);
}

async function withRedisSessionLock<T>(
  sessionId: string,
  fn: (session: MultiplayerSession) => Promise<T> | T,
): Promise<T | null> {
  const token = await acquireRedisSessionLock(sessionId);
  if (!token) return null;
  try {
    const session = await redisReadSession(sessionId);
    if (!session) return null;
    return await fn(session);
  } finally {
    await releaseRedisSessionLock(sessionId, token);
  }
}

function shouldUseRedisStore(): boolean {
  return isRedisConfigured();
}

export function publicView(
  session: MultiplayerSession,
  yourTokenHash: string | null,
): PublicSession {
  return {
    ...session,
    likes: session.likes.map(normalizeLikeEntry),
    players: session.players.map((p) => ({
      slot: p.slot,
      nickname: p.nickname,
      side: p.side,
      ready: p.ready,
      lastSeenAt: p.lastSeenAt,
      hintsUsedThisTurn: p.hintsUsedThisTurn,
      consecutiveSkips: p.consecutiveSkips,
      conceded: p.conceded,
      proposal: p.proposal,
      claimed: p.tokenHash.length > 0,
      composerDraft: p.composerDraft ?? null,
    })),
    yourSlot: yourTokenHash ? findSlotByTokenHash(session, yourTokenHash) : null,
  };
}

export type CreateSessionResult = {
  session: MultiplayerSession;
  slot: SlotId;
  playerToken: string;
};

export async function createSessionWithHost(args: {
  nickname: string;
  now?: number;
}): Promise<CreateSessionResult> {
  if (shouldUseRedisStore()) {
    const now = args.now ?? Date.now();
    for (let attempt = 0; attempt < 8; attempt++) {
      const playerToken = generatePlayerToken();
      const tokenHash = hashPlayerToken(playerToken);
      const empty = createEmptySession(now);
      const joined = joinSession(empty, {
        tokenHash,
        nickname: args.nickname,
        now,
      });
      if ("error" in joined) {
        throw new Error(joined.error);
      }
      if (await redisWriteSession(joined.session, "create")) {
        return { session: joined.session, slot: joined.slot, playerToken };
      }
    }
    throw new Error("Failed to allocate a unique session id.");
  }

  const state = ensureStore();
  const now = args.now ?? Date.now();
  evictExpired(state, now);
  const playerToken = generatePlayerToken();
  const tokenHash = hashPlayerToken(playerToken);
  const empty = createEmptySession(now);
  const joined = joinSession(empty, {
    tokenHash,
    nickname: args.nickname,
    now,
  });
  if ("error" in joined) {
    throw new Error(joined.error);
  }
  const session = commit(state, joined.session);
  return { session, slot: joined.slot, playerToken };
}

export async function getSession(id: string): Promise<MultiplayerSession | null> {
  if (shouldUseRedisStore()) return redisReadSession(id);
  const state = ensureStore();
  evictExpired(state, Date.now());
  return state.sessions.get(id) ?? null;
}

export function resolveSlotByToken(
  session: MultiplayerSession,
  playerToken: string | null,
): SlotId | null {
  if (!playerToken) return null;
  return findSlotByTokenHash(session, hashPlayerToken(playerToken));
}

export type JoinResult =
  | { kind: "ok"; session: MultiplayerSession; slot: SlotId; playerToken: string }
  | { kind: "already"; session: MultiplayerSession; slot: SlotId }
  | { kind: "error"; reason: string };

export async function joinExistingSession(args: {
  sessionId: string;
  nickname: string;
  existingToken?: string | null;
}): Promise<JoinResult> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      if (args.existingToken) {
        const knownSlot = findSlotByTokenHash(
          session,
          hashPlayerToken(args.existingToken),
        );
        if (knownSlot) {
          const updated = touchPresence(session, knownSlot, Date.now());
          await redisWriteSession(updated, "update");
          return { kind: "already" as const, session: updated, slot: knownSlot };
        }
      }
      const now = Date.now();
      const playerToken = generatePlayerToken();
      const result = joinSession(session, {
        tokenHash: hashPlayerToken(playerToken),
        nickname: args.nickname,
        now,
      });
      if ("error" in result) {
        return { kind: "error" as const, reason: result.error };
      }
      await redisWriteSession(result.session, "update");
      return {
        kind: "ok" as const,
        session: result.session,
        slot: result.slot,
        playerToken,
      };
    });
    return locked ?? { kind: "error", reason: "Session not found." };
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  if (args.existingToken) {
    const knownSlot = findSlotByTokenHash(
      session,
      hashPlayerToken(args.existingToken),
    );
    if (knownSlot) {
      const now = Date.now();
      const updated = touchPresence(session, knownSlot, now);
      const committed = commit(state, updated);
      return { kind: "already", session: committed, slot: knownSlot };
    }
  }
  const now = Date.now();
  const playerToken = generatePlayerToken();
  const result = joinSession(session, {
    tokenHash: hashPlayerToken(playerToken),
    nickname: args.nickname,
    now,
  });
  if ("error" in result) {
    return { kind: "error", reason: result.error };
  }
  const committed = commit(state, result.session);
  return {
    kind: "ok",
    session: committed,
    slot: result.slot,
    playerToken,
  };
}

export type LobbyUpdateResult =
  | { kind: "ok"; session: MultiplayerSession; started: boolean }
  | { kind: "error"; reason: string };

export async function applyLobbyUpdate(args: {
  sessionId: string;
  slot: SlotId;
  update: Parameters<typeof updateLobby>[2];
}): Promise<LobbyUpdateResult> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const now = Date.now();
      const updated = updateLobby(session, args.slot, args.update, now);
      const started = tryStartLive(updated, now);
      const next = started.state === "live" ? started : updated;
      await redisWriteSession(next, "update");
      return {
        kind: "ok" as const,
        session: next,
        started: started.state === "live" && updated.state === "lobby",
      };
    });
    return locked ?? { kind: "error", reason: "Session not found." };
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const now = Date.now();
  const updated = updateLobby(session, args.slot, args.update, now);
  const started = tryStartLive(updated, now);
  const next = started.state === "live" ? started : updated;
  const committed = commit(state, next);
  return {
    kind: "ok",
    session: committed,
    started: started.state === "live" && updated.state === "lobby",
  };
}

export type MoveResult =
  | { kind: "ok"; session: MultiplayerSession; finished: boolean }
  | { kind: "error"; reason: string };

export type ComposerDraftResult =
  | { kind: "ok"; session: MultiplayerSession }
  | { kind: "error"; reason: string };

export async function applyComposerDraft(args: {
  sessionId: string;
  slot: SlotId;
  wordCount: number;
}): Promise<ComposerDraftResult> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const result = recordComposerDraft(session, args.slot, args.wordCount, Date.now());
      if (result.kind === "error") return result;
      await redisWriteSession(result.session, "update");
      return { kind: "ok" as const, session: result.session };
    });
    return locked ?? { kind: "error", reason: "Session not found." };
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const now = Date.now();
  const result = recordComposerDraft(session, args.slot, args.wordCount, now);
  if (result.kind === "error") return result;
  return { kind: "ok", session: commit(state, result.session) };
}

export async function applyMove(args: {
  sessionId: string;
  slot: SlotId;
  text: string;
  skipped?: boolean;
}): Promise<MoveResult> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const result = recordMove(session, args.slot, args.text, {
        skipped: Boolean(args.skipped),
        now: Date.now(),
      });
      if (result.kind === "error") return result;
      await redisWriteSession(result.session, "update");
      return { kind: "ok" as const, session: result.session, finished: result.finished };
    });
    return locked ?? { kind: "error", reason: "Session not found." };
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const now = Date.now();
  const result = recordMove(session, args.slot, args.text, {
    skipped: Boolean(args.skipped),
    now,
  });
  if (result.kind === "error") return result;
  const committed = commit(state, result.session);
  return { kind: "ok", session: committed, finished: result.finished };
}

export async function applyFactcheckResult(args: {
  sessionId: string;
  round: number;
  side: "FOR" | "AGAINST";
  factcheck: FactCheck;
}): Promise<MultiplayerSession | null> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const next = applyFactcheck(session, {
        round: args.round,
        side: args.side,
        factcheck: args.factcheck,
        now: Date.now(),
      });
      await redisWriteSession(next, "update");
      return next;
    });
    return locked;
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return null;
  const now = Date.now();
  const next = applyFactcheck(session, {
    round: args.round,
    side: args.side,
    factcheck: args.factcheck,
    now,
  });
  return commit(state, next);
}

export async function applyVerdict(args: {
  sessionId: string;
  verdict: Verdict;
}): Promise<MultiplayerSession | null> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const next = setVerdict(session, args.verdict, Date.now());
      await redisWriteSession(next, "update");
      return next;
    });
    return locked;
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return null;
  const now = Date.now();
  const next = setVerdict(session, args.verdict, now);
  return commit(state, next);
}

export async function applyConcede(args: {
  sessionId: string;
  slot: SlotId;
}): Promise<{ kind: "ok"; session: MultiplayerSession } | { kind: "error"; reason: string }> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const next = recordConcede(session, args.slot, Date.now());
      await redisWriteSession(next, "update");
      return { kind: "ok" as const, session: next };
    });
    return locked ?? { kind: "error", reason: "Session not found." };
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const now = Date.now();
  const next = recordConcede(session, args.slot, now);
  return { kind: "ok", session: commit(state, next) };
}

export async function consumeHintForSlot(args: {
  sessionId: string;
  slot: SlotId;
}): Promise<{ kind: "ok"; session: MultiplayerSession } | { kind: "error"; reason: string }> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const result = consumeHint(session, args.slot, Date.now());
      if ("error" in result) return { kind: "error" as const, reason: result.error };
      await redisWriteSession(result, "update");
      return { kind: "ok" as const, session: result };
    });
    return locked ?? { kind: "error", reason: "Session not found." };
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const result = consumeHint(session, args.slot, Date.now());
  if ("error" in result) return { kind: "error", reason: result.error };
  return { kind: "ok", session: commit(state, result) };
}

export async function touchSession(args: {
  sessionId: string;
  slot: SlotId;
}): Promise<MultiplayerSession | null> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const next = touchPresence(session, args.slot, Date.now());
      await redisWriteSession(next, "update");
      return next;
    });
    return locked;
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return null;
  const next = touchPresence(session, args.slot, Date.now());
  return commit(state, next);
}

export async function expireDeadlineIfDue(
  sessionId: string,
): Promise<{
  expired: boolean;
  expiredSlot: SlotId | null;
  session: MultiplayerSession | null;
}> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(sessionId, async (session) => {
      const now = Date.now();
      if (!isDeadlineExpired(session, now)) {
        return { expired: false, expiredSlot: null, session };
      }
      const turnSlot: SlotId =
        session.players[0].side === session.currentSide ? "A" : "B";
      const result = recordMove(session, turnSlot, "", { skipped: true, now });
      if (result.kind === "error") {
        return { expired: false, expiredSlot: null, session };
      }
      await redisWriteSession(result.session, "update");
      return {
        expired: true,
        expiredSlot: turnSlot,
        session: result.session,
      };
    });
    return locked ?? { expired: false, expiredSlot: null, session: null };
  }

  const state = ensureStore();
  const session = state.sessions.get(sessionId);
  if (!session) return { expired: false, expiredSlot: null, session: null };
  const now = Date.now();
  if (!isDeadlineExpired(session, now)) {
    return { expired: false, expiredSlot: null, session };
  }
  // Auto-skip the current side's turn.
  const turnSlot =
    session.players[0].side === session.currentSide ? "A" : "B";
  const result = recordMove(session, turnSlot, "", { skipped: true, now });
  if (result.kind === "error") {
    return { expired: false, expiredSlot: null, session };
  }
  return {
    expired: true,
    expiredSlot: turnSlot,
    session: commit(state, result.session),
  };
}

export type ChangeListener = (session: MultiplayerSession) => void;

export async function subscribeToSession(
  sessionId: string,
  listener: ChangeListener,
): Promise<() => void> {
  if (shouldUseRedisStore()) {
    const subscriber = await getRedisSubscriber();
    if (!subscriber) return () => {};
    const channel = redisSessionChannel(sessionId);
    const onMessage = (message: string) => {
      const session = parseRedisSession(message, sessionId);
      if (session) listener(session);
    };
    await subscriber.subscribe(channel, onMessage);
    return () => {
      void subscriber.unsubscribe(channel, onMessage).catch(() => undefined);
    };
  }

  const state = ensureStore();
  const event = `change:${sessionId}`;
  state.emitter.on(event, listener);
  return () => {
    state.emitter.off(event, listener);
  };
}

import type { Side } from "@/lib/types";

export type ApplyLikeResult =
  | { kind: "ok"; session: MultiplayerSession }
  | { kind: "error"; reason: string };

export async function applyLike(args: {
  sessionId: string;
  name: string;
  round: number;
  side: Side;
  kind?: SpecReactionKind;
}): Promise<ApplyLikeResult> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const result = recordLike(session, { ...args, now: Date.now() });
      if (result.kind === "error") return result;
      await redisWriteSession(result.session, "update");
      return { kind: "ok" as const, session: result.session };
    });
    return locked ?? { kind: "error", reason: "Session not found." };
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const result = recordLike(session, { ...args, now: Date.now() });
  if (result.kind === "error") return result;
  return { kind: "ok", session: commit(state, result.session) };
}

export async function applyRemoveLike(args: {
  sessionId: string;
  name: string;
  round: number;
  side: Side;
  kind?: SpecReactionKind;
}): Promise<ApplyLikeResult> {
  if (shouldUseRedisStore()) {
    const locked = await withRedisSessionLock(args.sessionId, async (session) => {
      const result = removeLike(session, { ...args, now: Date.now() });
      if (result.kind === "error") return result;
      await redisWriteSession(result.session, "update");
      return { kind: "ok" as const, session: result.session };
    });
    return locked ?? { kind: "error", reason: "Session not found." };
  }

  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const result = removeLike(session, { ...args, now: Date.now() });
  if (result.kind === "error") return result;
  return { kind: "ok", session: commit(state, result.session) };
}

export function getStoreInternalsForTests(): {
  state: StoreState;
  reset: () => void;
  flush: () => Promise<void>;
} {
  const state = ensureStore();
  return {
    state,
    reset: () => {
      state.sessions.clear();
      state.dirty = true;
    },
    flush: () => {
      state.dirty = true;
      return persistNow(state);
    },
  };
}

export { hashPlayerToken, getSlot };
export const DEFAULT_TTL_MS = DEFAULT_SESSION_TTL_MS;
