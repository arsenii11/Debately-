import { randomBytes, createHash } from "node:crypto";
import {
  DEFAULT_TURN_ROUNDS,
  DEFAULT_TURN_TIMER_SECONDS,
  MAX_TURN_ROUNDS,
  MAX_TURN_TIMER_SECONDS,
  MIN_TURN_ROUNDS,
  MIN_TURN_TIMER_SECONDS,
  UNTIMED_TURN_TIMER_SECONDS,
} from "@/lib/types";
import type {
  FactCheck,
  Side,
  TurnRounds,
  TurnTimerSeconds,
  Verdict,
} from "@/lib/types";
import {
  SPEC_REACTION_KINDS,
  type LobbyProposal,
  type MultiplayerRound,
  type MultiplayerSession,
  type PlayerSlot,
  type SessionSettings,
  type SlotId,
  type SpecLike,
  type SpecReactionKind,
} from "@/lib/multiplayer/types";

export const SKIP_AUTO_CONCEDE_THRESHOLD = 3;
export const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const SESSION_ID_LENGTH = 10;

export function generateSessionId(): string {
  const bytes = randomBytes(SESSION_ID_LENGTH);
  let out = "";
  for (let i = 0; i < SESSION_ID_LENGTH; i++) {
    out += SESSION_ID_ALPHABET[bytes[i]! % SESSION_ID_ALPHABET.length];
  }
  return out;
}

export function generatePlayerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPlayerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function clampRounds(value: unknown): TurnRounds {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TURN_ROUNDS;
  }
  return Math.min(MAX_TURN_ROUNDS, Math.max(MIN_TURN_ROUNDS, Math.floor(value)));
}

function clampTimer(value: unknown): TurnTimerSeconds {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TURN_TIMER_SECONDS;
  }
  const v = Math.floor(value);
  if (v <= 0) return UNTIMED_TURN_TIMER_SECONDS;
  return Math.min(MAX_TURN_TIMER_SECONDS, Math.max(MIN_TURN_TIMER_SECONDS, v));
}

function emptyProposal(): LobbyProposal {
  return {
    topic: null,
    side: null,
    turnRounds: null,
    turnTimerSeconds: null,
  };
}

function emptyPlayerSlot(slot: SlotId): PlayerSlot {
  return {
    slot,
    tokenHash: "",
    nickname: "",
    side: null,
    ready: false,
    lastSeenAt: 0,
    hintsUsedThisTurn: 0,
    consecutiveSkips: 0,
    conceded: false,
    proposal: emptyProposal(),
  };
}

export function createEmptySession(now: number): MultiplayerSession {
  return {
    v: 1,
    id: generateSessionId(),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + DEFAULT_SESSION_TTL_MS,
    revision: 0,
    state: "lobby",
    settings: {
      topic: "",
      turnRounds: DEFAULT_TURN_ROUNDS,
      turnTimerSeconds: DEFAULT_TURN_TIMER_SECONDS,
    },
    players: [emptyPlayerSlot("A"), emptyPlayerSlot("B")],
    history: [],
    currentRound: 0,
    currentSide: "FOR",
    currentDeadlineAt: null,
    verdict: null,
    concededBy: null,
    skippedTurns: { FOR: 0, AGAINST: 0 },
    likes: [],
  };
}

export function findSlotByTokenHash(
  session: MultiplayerSession,
  tokenHash: string,
): SlotId | null {
  if (!tokenHash) return null;
  for (const slot of session.players) {
    if (slot.tokenHash && slot.tokenHash === tokenHash) return slot.slot;
  }
  return null;
}

export function getSlot(
  session: MultiplayerSession,
  slot: SlotId,
): PlayerSlot {
  return slot === "A" ? session.players[0] : session.players[1];
}

function setSlot(
  session: MultiplayerSession,
  slot: PlayerSlot,
): MultiplayerSession {
  const players: [PlayerSlot, PlayerSlot] =
    slot.slot === "A"
      ? [slot, session.players[1]]
      : [session.players[0], slot];
  return { ...session, players };
}

export function freeSlot(session: MultiplayerSession): SlotId | null {
  if (!session.players[0].tokenHash) return "A";
  if (!session.players[1].tokenHash) return "B";
  return null;
}

function bumpRevision(
  session: MultiplayerSession,
  now: number,
): MultiplayerSession {
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: now,
  };
}

export function joinSession(
  session: MultiplayerSession,
  args: { tokenHash: string; nickname: string; now: number },
): { session: MultiplayerSession; slot: SlotId } | { error: string } {
  if (session.state !== "lobby") return { error: "Session is no longer in lobby." };
  const slot = freeSlot(session);
  if (!slot) return { error: "Session is full." };
  const player: PlayerSlot = {
    ...emptyPlayerSlot(slot),
    tokenHash: args.tokenHash,
    nickname: args.nickname.slice(0, 32),
    lastSeenAt: args.now,
  };
  const next = setSlot(session, player);
  return { session: bumpRevision(next, args.now), slot };
}

export function touchPresence(
  session: MultiplayerSession,
  slot: SlotId,
  now: number,
): MultiplayerSession {
  const player = getSlot(session, slot);
  return setSlot(session, { ...player, lastSeenAt: now });
}

type LobbyUpdate = {
  topic?: string | null;
  side?: Side | null;
  turnRounds?: number | null;
  turnTimerSeconds?: number | null;
  nickname?: string;
  ready?: boolean;
};

export function updateLobby(
  session: MultiplayerSession,
  slot: SlotId,
  update: LobbyUpdate,
  now: number,
): MultiplayerSession {
  if (session.state !== "lobby") return session;
  const player = getSlot(session, slot);
  const proposal: LobbyProposal = { ...player.proposal };
  let nickname = player.nickname;
  let side = player.side;
  let ready = player.ready;

  if (update.topic !== undefined) {
    const t = (update.topic ?? "").toString().slice(0, 280).trim();
    proposal.topic = t.length === 0 ? null : t;
  }
  if (update.side !== undefined) {
    proposal.side = update.side === "FOR" || update.side === "AGAINST" ? update.side : null;
    side = proposal.side;
  }
  if (update.turnRounds !== undefined) {
    proposal.turnRounds =
      update.turnRounds === null ? null : clampRounds(update.turnRounds);
  }
  if (update.turnTimerSeconds !== undefined) {
    proposal.turnTimerSeconds =
      update.turnTimerSeconds === null ? null : clampTimer(update.turnTimerSeconds);
  }
  if (typeof update.nickname === "string") {
    nickname = update.nickname.slice(0, 32);
  }
  if (typeof update.ready === "boolean") {
    ready = update.ready;
  }

  let next = setSlot(session, {
    ...player,
    proposal,
    nickname,
    side,
    ready,
    lastSeenAt: now,
  });
  next = mirrorOpponentSide(next, slot);
  return bumpRevision(next, now);
}

function mirrorOpponentSide(
  session: MultiplayerSession,
  changedSlot: SlotId,
): MultiplayerSession {
  const me = getSlot(session, changedSlot);
  const otherSlotId: SlotId = changedSlot === "A" ? "B" : "A";
  const other = getSlot(session, otherSlotId);
  if (!other.tokenHash) return session;
  if (me.side && other.side && me.side === other.side) {
    const flipped: Side = me.side === "FOR" ? "AGAINST" : "FOR";
    return setSlot(session, {
      ...other,
      side: flipped,
      proposal: { ...other.proposal, side: flipped },
      ready: false,
    });
  }
  return session;
}

function deriveSettings(
  session: MultiplayerSession,
): SessionSettings | { error: string } {
  const a = session.players[0];
  const b = session.players[1];
  const topics = [a.proposal.topic, b.proposal.topic].filter(
    (t): t is string => typeof t === "string" && t.trim().length > 0,
  );
  if (topics.length === 0) {
    return { error: "Choose a topic before starting." };
  }
  const topic = topics[topics.length - 1]!.trim();

  const rounds = [a.proposal.turnRounds, b.proposal.turnRounds]
    .filter((v): v is number => typeof v === "number")
    .pop();
  const timer = [a.proposal.turnTimerSeconds, b.proposal.turnTimerSeconds]
    .filter((v): v is number => typeof v === "number")
    .pop();

  return {
    topic,
    turnRounds: clampRounds(rounds ?? DEFAULT_TURN_ROUNDS),
    turnTimerSeconds: clampTimer(
      timer ?? DEFAULT_TURN_TIMER_SECONDS,
    ),
  };
}

function pickSidesForStart(
  session: MultiplayerSession,
): { a: Side; b: Side } {
  const a = session.players[0].side;
  const b = session.players[1].side;
  if (a && b && a !== b) return { a, b };
  if (a && !b) return { a, b: a === "FOR" ? "AGAINST" : "FOR" };
  if (!a && b) return { a: b === "FOR" ? "AGAINST" : "FOR", b };
  return { a: "FOR", b: "AGAINST" };
}

export function tryStartLive(
  session: MultiplayerSession,
  now: number,
): MultiplayerSession {
  if (session.state !== "lobby") return session;
  const a = session.players[0];
  const b = session.players[1];
  if (!a.tokenHash || !b.tokenHash) return session;
  if (!a.ready || !b.ready) return session;
  const settings = deriveSettings(session);
  if ("error" in settings) return session;
  const sides = pickSidesForStart(session);
  const players: [PlayerSlot, PlayerSlot] = [
    { ...a, side: sides.a, ready: true, hintsUsedThisTurn: 0, consecutiveSkips: 0 },
    { ...b, side: sides.b, ready: true, hintsUsedThisTurn: 0, consecutiveSkips: 0 },
  ];
  const history: MultiplayerRound[] = [
    {
      round: 1,
      forMove: null,
      againstMove: null,
      factcheckFor: null,
      factcheckAgainst: null,
    },
  ];
  const deadline =
    settings.turnTimerSeconds > 0
      ? now + settings.turnTimerSeconds * 1000
      : null;
  return bumpRevision(
    {
      ...session,
      players,
      settings,
      state: "live",
      history,
      currentRound: 1,
      currentSide: "FOR",
      currentDeadlineAt: deadline,
      skippedTurns: { FOR: 0, AGAINST: 0 },
    },
    now,
  );
}

function getCurrentTurnSlot(session: MultiplayerSession): SlotId | null {
  if (session.state !== "live") return null;
  const a = session.players[0];
  const b = session.players[1];
  if (a.side === session.currentSide) return "A";
  if (b.side === session.currentSide) return "B";
  return null;
}

export function isPlayerOnTurn(
  session: MultiplayerSession,
  slot: SlotId,
): boolean {
  return getCurrentTurnSlot(session) === slot;
}

function setHistoryRound(
  session: MultiplayerSession,
  round: MultiplayerRound,
): MultiplayerSession {
  const idx = round.round - 1;
  const history = [...session.history];
  history[idx] = round;
  return { ...session, history };
}

function getCurrentRoundData(session: MultiplayerSession): MultiplayerRound {
  const r = session.history[session.currentRound - 1];
  if (r) return r;
  return {
    round: session.currentRound,
    forMove: null,
    againstMove: null,
    factcheckFor: null,
    factcheckAgainst: null,
  };
}

function bothSidesMovedThisRound(round: MultiplayerRound): boolean {
  return round.forMove !== null && round.againstMove !== null;
}

export type RecordMoveResult =
  | { kind: "ok"; session: MultiplayerSession; finished: boolean }
  | { kind: "error"; reason: string };

export function recordMove(
  session: MultiplayerSession,
  slot: SlotId,
  text: string,
  args: { skipped: boolean; now: number },
): RecordMoveResult {
  if (session.state !== "live") {
    return { kind: "error", reason: "Debate is not in progress." };
  }
  const turnSlot = getCurrentTurnSlot(session);
  if (turnSlot !== slot) {
    return { kind: "error", reason: "Not your turn." };
  }
  const player = getSlot(session, slot);
  const trimmed = (text ?? "").toString().slice(0, 4000);
  const move = args.skipped ? "[Turn skipped — time expired]" : trimmed.trim();
  if (!args.skipped && !move) {
    return { kind: "error", reason: "Empty argument." };
  }

  const round = getCurrentRoundData(session);
  const updatedRound: MultiplayerRound =
    session.currentSide === "FOR"
      ? { ...round, forMove: move }
      : { ...round, againstMove: move };

  let next = setHistoryRound(session, updatedRound);
  const skipsForSide = args.skipped
    ? next.skippedTurns[session.currentSide] + 1
    : next.skippedTurns[session.currentSide];
  next = {
    ...next,
    skippedTurns: { ...next.skippedTurns, [session.currentSide]: skipsForSide },
  };
  next = setSlot(next, {
    ...player,
    consecutiveSkips: args.skipped ? player.consecutiveSkips + 1 : 0,
    hintsUsedThisTurn: 0,
    lastSeenAt: args.now,
    composerDraft: null,
  });

  const roundFullyDone = bothSidesMovedThisRound(updatedRound);
  const isFinalRound = session.currentRound >= session.settings.turnRounds;
  let finished = false;

  if (roundFullyDone && isFinalRound) {
    next = {
      ...next,
      state: "finished",
      currentDeadlineAt: null,
    };
    finished = true;
  } else if (roundFullyDone) {
    const nextRound = session.currentRound + 1;
    const nextHistory = [...next.history];
    nextHistory[nextRound - 1] = {
      round: nextRound,
      forMove: null,
      againstMove: null,
      factcheckFor: null,
      factcheckAgainst: null,
    };
    next = {
      ...next,
      history: nextHistory,
      currentRound: nextRound,
      currentSide: "FOR",
      currentDeadlineAt:
        next.settings.turnTimerSeconds > 0
          ? args.now + next.settings.turnTimerSeconds * 1000
          : null,
    };
  } else {
    next = {
      ...next,
      currentSide: session.currentSide === "FOR" ? "AGAINST" : "FOR",
      currentDeadlineAt:
        next.settings.turnTimerSeconds > 0
          ? args.now + next.settings.turnTimerSeconds * 1000
          : null,
    };
  }

  // Auto-concede after too many consecutive skips on this side.
  const skipper = getSlot(next, slot);
  if (
    !finished &&
    skipper.consecutiveSkips >= SKIP_AUTO_CONCEDE_THRESHOLD
  ) {
    next = {
      ...next,
      state: "finished",
      currentDeadlineAt: null,
      concededBy: slot,
    };
    finished = true;
  }

  if (finished) {
    next = {
      ...next,
      players: [
        { ...next.players[0], composerDraft: null },
        { ...next.players[1], composerDraft: null },
      ],
    };
  }

  return { kind: "ok", session: bumpRevision(next, args.now), finished };
}

export type RecordComposerDraftResult =
  | { kind: "ok"; session: MultiplayerSession }
  | { kind: "error"; reason: string };

export function recordComposerDraft(
  session: MultiplayerSession,
  slot: SlotId,
  wordCount: number,
  now: number,
): RecordComposerDraftResult {
  if (session.state !== "live") {
    return { kind: "error", reason: "Debate is not in progress." };
  }
  const turnSlot = getCurrentTurnSlot(session);
  if (turnSlot !== slot) {
    return { kind: "error", reason: "Not your turn." };
  }
  const w = Math.max(0, Math.min(5000, Math.floor(wordCount)));
  const player = getSlot(session, slot);
  const next = setSlot(session, {
    ...player,
    composerDraft: { wordCount: w, updatedAt: now },
    lastSeenAt: now,
  });
  return { kind: "ok", session: bumpRevision(next, now) };
}

export function applyFactcheck(
  session: MultiplayerSession,
  args: { round: number; side: Side; factcheck: FactCheck; now: number },
): MultiplayerSession {
  const idx = args.round - 1;
  const round = session.history[idx];
  if (!round) return session;
  const updated: MultiplayerRound =
    args.side === "FOR"
      ? { ...round, factcheckFor: args.factcheck }
      : { ...round, factcheckAgainst: args.factcheck };
  return bumpRevision(setHistoryRound(session, updated), args.now);
}

const RESULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function setVerdict(
  session: MultiplayerSession,
  verdict: Verdict,
  now: number,
): MultiplayerSession {
  return bumpRevision(
    { ...session, verdict, state: "finished", expiresAt: now + RESULT_TTL_MS },
    now,
  );
}

export function recordConcede(
  session: MultiplayerSession,
  slot: SlotId,
  now: number,
): MultiplayerSession {
  if (session.state === "finished") return session;
  const player = getSlot(session, slot);
  const next = setSlot(session, { ...player, conceded: true });
  return bumpRevision(
    {
      ...next,
      state: "finished",
      concededBy: slot,
      currentDeadlineAt: null,
    },
    now,
  );
}

export function isDeadlineExpired(
  session: MultiplayerSession,
  now: number,
): boolean {
  if (session.state !== "live") return false;
  if (session.currentDeadlineAt === null) return false;
  return now >= session.currentDeadlineAt;
}

export function consumeHint(
  session: MultiplayerSession,
  slot: SlotId,
  now: number,
): MultiplayerSession | { error: string } {
  if (session.state !== "live") return { error: "Not in a live debate." };
  const player = getSlot(session, slot);
  if (player.hintsUsedThisTurn >= 1) {
    return { error: "Hint already used this turn." };
  }
  return bumpRevision(
    setSlot(session, {
      ...player,
      hintsUsedThisTurn: player.hintsUsedThisTurn + 1,
      lastSeenAt: now,
    }),
    now,
  );
}

const MAX_LIKES_PER_SESSION = 500;
const MAX_SPEC_NAME_LENGTH = 32;

export type RecordLikeResult =
  | { kind: "ok"; session: MultiplayerSession }
  | { kind: "error"; reason: string };

function normalizeReactionKind(k: unknown): SpecReactionKind {
  return SPEC_REACTION_KINDS.includes(k as SpecReactionKind)
    ? (k as SpecReactionKind)
    : "like";
}

/** Spectator adds a reaction to a specific argument. Deduped by name+round+side+kind. */
export function recordLike(
  session: MultiplayerSession,
  args: {
    name: string;
    round: number;
    side: Side;
    kind?: SpecReactionKind;
    now: number;
  },
): RecordLikeResult {
  const name = args.name.trim().slice(0, MAX_SPEC_NAME_LENGTH);
  if (!name) return { kind: "error", reason: "Name is required." };
  const kind = normalizeReactionKind(args.kind);
  if (args.round < 1 || args.round > session.history.length) {
    return { kind: "error", reason: "Invalid round." };
  }
  const roundData = session.history[args.round - 1];
  if (!roundData) return { kind: "error", reason: "Round not found." };
  const moveExists =
    args.side === "FOR" ? !!roundData.forMove : !!roundData.againstMove;
  if (!moveExists) return { kind: "error", reason: "Argument not yet submitted." };

  const already = session.likes.some(
    (l) =>
      l.name.toLowerCase() === name.toLowerCase() &&
      l.round === args.round &&
      l.side === args.side &&
      normalizeReactionKind(l.kind) === kind,
  );
  if (already) return { kind: "error", reason: "You already used this reaction here." };

  if (session.likes.length >= MAX_LIKES_PER_SESSION) {
    return { kind: "error", reason: "Reaction limit reached." };
  }

  const like: SpecLike = {
    name,
    round: args.round,
    side: args.side,
    at: args.now,
    kind,
  };
  return {
    kind: "ok",
    session: bumpRevision({ ...session, likes: [...session.likes, like] }, args.now),
  };
}

export function removeLike(
  session: MultiplayerSession,
  args: {
    name: string;
    round: number;
    side: Side;
    kind?: SpecReactionKind;
    now: number;
  },
): RecordLikeResult {
  const name = args.name.trim().slice(0, MAX_SPEC_NAME_LENGTH);
  if (!name) return { kind: "error", reason: "Name is required." };
  const kind = normalizeReactionKind(args.kind);
  if (args.round < 1 || args.round > session.history.length) {
    return { kind: "error", reason: "Invalid round." };
  }
  const roundData = session.history[args.round - 1];
  if (!roundData) return { kind: "error", reason: "Round not found." };

  let removed = false;
  const next = session.likes.filter((l) => {
    const match =
      l.name.toLowerCase() === name.toLowerCase() &&
      l.round === args.round &&
      l.side === args.side &&
      normalizeReactionKind(l.kind) === kind;
    if (match) removed = true;
    return !match;
  });
  if (!removed) {
    return { kind: "error", reason: "You do not have this reaction here." };
  }
  return {
    kind: "ok",
    session: bumpRevision({ ...session, likes: next }, args.now),
  };
}

/** RoundData-shaped view of the multiplayer history from the perspective of `mySide`. */
export function viewHistoryFromSide(
  history: MultiplayerRound[],
  mySide: Side,
): Array<{
  round: number;
  playerMove: string;
  aiFactcheckPlayer: FactCheck | null;
  opponentMove: string | null;
  aiFactcheckOpponent: FactCheck | null;
}> {
  return history.map((r) => {
    if (mySide === "FOR") {
      return {
        round: r.round,
        playerMove: r.forMove ?? "",
        aiFactcheckPlayer: r.factcheckFor,
        opponentMove: r.againstMove,
        aiFactcheckOpponent: r.factcheckAgainst,
      };
    }
    return {
      round: r.round,
      playerMove: r.againstMove ?? "",
      aiFactcheckPlayer: r.factcheckAgainst,
      opponentMove: r.forMove,
      aiFactcheckOpponent: r.factcheckFor,
    };
  });
}
