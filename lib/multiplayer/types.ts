import type {
  FactCheck,
  Side,
  TurnRounds,
  TurnTimerSeconds,
  Verdict,
} from "@/lib/types";

export type SlotId = "A" | "B";

export type SessionState = "lobby" | "live" | "finished";

export type MultiplayerRound = {
  round: number;
  forMove: string | null;
  againstMove: string | null;
  factcheckFor: FactCheck | null;
  factcheckAgainst: FactCheck | null;
};

export type LobbyProposal = {
  topic: string | null;
  side: Side | null;
  turnRounds: TurnRounds | null;
  turnTimerSeconds: TurnTimerSeconds | null;
};

export type PlayerSlot = {
  slot: SlotId;
  /** sha256(token) hex; empty string when slot is unclaimed. */
  tokenHash: string;
  nickname: string;
  side: Side | null;
  ready: boolean;
  lastSeenAt: number;
  hintsUsedThisTurn: number;
  consecutiveSkips: number;
  conceded: boolean;
  proposal: LobbyProposal;
};

export type SessionSettings = {
  topic: string;
  turnRounds: TurnRounds;
  turnTimerSeconds: TurnTimerSeconds;
};

export type MultiplayerSession = {
  v: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  revision: number;
  state: SessionState;
  settings: SessionSettings;
  players: [PlayerSlot, PlayerSlot];
  history: MultiplayerRound[];
  currentRound: number;
  currentSide: Side;
  currentDeadlineAt: number | null;
  verdict: Verdict | null;
  concededBy: SlotId | null;
  /** Counts skips by side label so verdict prompt can apply -5 per skip. */
  skippedTurns: { FOR: number; AGAINST: number };
};

/** Public-facing snapshot — token hashes redacted, "yourSlot" set per recipient. */
export type PublicSession = Omit<MultiplayerSession, "players"> & {
  players: Array<Omit<PlayerSlot, "tokenHash"> & { claimed: boolean }>;
  yourSlot: SlotId | null;
};
