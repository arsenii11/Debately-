import { EventEmitter } from "node:events";
import { promises as fsp, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { debatelyLog } from "@/lib/debatelyLog";
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
  recordConcede,
  recordLike,
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
    })),
    yourSlot: yourTokenHash ? findSlotByTokenHash(session, yourTokenHash) : null,
  };
}

export type CreateSessionResult = {
  session: MultiplayerSession;
  slot: SlotId;
  playerToken: string;
};

export function createSessionWithHost(args: {
  nickname: string;
  now?: number;
}): CreateSessionResult {
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

export function getSession(id: string): MultiplayerSession | null {
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

export function joinExistingSession(args: {
  sessionId: string;
  nickname: string;
  existingToken?: string | null;
}): JoinResult {
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

export function applyLobbyUpdate(args: {
  sessionId: string;
  slot: SlotId;
  update: Parameters<typeof updateLobby>[2];
}): LobbyUpdateResult {
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

export function applyMove(args: {
  sessionId: string;
  slot: SlotId;
  text: string;
  skipped?: boolean;
}): MoveResult {
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

export function applyFactcheckResult(args: {
  sessionId: string;
  round: number;
  side: "FOR" | "AGAINST";
  factcheck: FactCheck;
}): MultiplayerSession | null {
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

export function applyVerdict(args: {
  sessionId: string;
  verdict: Verdict;
}): MultiplayerSession | null {
  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return null;
  const now = Date.now();
  const next = setVerdict(session, args.verdict, now);
  return commit(state, next);
}

export function applyConcede(args: {
  sessionId: string;
  slot: SlotId;
}): { kind: "ok"; session: MultiplayerSession } | { kind: "error"; reason: string } {
  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const now = Date.now();
  const next = recordConcede(session, args.slot, now);
  return { kind: "ok", session: commit(state, next) };
}

export function consumeHintForSlot(args: {
  sessionId: string;
  slot: SlotId;
}): { kind: "ok"; session: MultiplayerSession } | { kind: "error"; reason: string } {
  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const result = consumeHint(session, args.slot, Date.now());
  if ("error" in result) return { kind: "error", reason: result.error };
  return { kind: "ok", session: commit(state, result) };
}

export function touchSession(args: {
  sessionId: string;
  slot: SlotId;
}): MultiplayerSession | null {
  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return null;
  const next = touchPresence(session, args.slot, Date.now());
  state.sessions.set(next.id, next);
  return next;
}

export function expireDeadlineIfDue(
  sessionId: string,
): { expired: boolean; session: MultiplayerSession | null } {
  const state = ensureStore();
  const session = state.sessions.get(sessionId);
  if (!session) return { expired: false, session: null };
  const now = Date.now();
  if (!isDeadlineExpired(session, now)) {
    return { expired: false, session };
  }
  // Auto-skip the current side's turn.
  const turnSlot =
    session.players[0].side === session.currentSide ? "A" : "B";
  const result = recordMove(session, turnSlot, "", { skipped: true, now });
  if (result.kind === "error") {
    return { expired: false, session };
  }
  return { expired: true, session: commit(state, result.session) };
}

export type ChangeListener = (session: MultiplayerSession) => void;

export function subscribeToSession(
  sessionId: string,
  listener: ChangeListener,
): () => void {
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

export function applyLike(args: {
  sessionId: string;
  name: string;
  round: number;
  side: Side;
  kind?: SpecReactionKind;
}): ApplyLikeResult {
  const state = ensureStore();
  const session = state.sessions.get(args.sessionId);
  if (!session) return { kind: "error", reason: "Session not found." };
  const result = recordLike(session, { ...args, now: Date.now() });
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
