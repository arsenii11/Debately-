import type {
  Phase,
  RoundData,
  Side,
  TurnRounds,
  TurnTimerSeconds,
  Verdict,
} from "@/lib/types";

const STORAGE_KEY = "debately:v1";

export type DebatelyPersisted = {
  v: 1;
  phase: Phase;
  nickname: string;
  topic: string;
  playerSide: Side;
  history: RoundData[];
  currentRound: number;
  turnRounds: TurnRounds;
  inputText: string;
  timer: number;
  turnTimerSeconds: TurnTimerSeconds;
  timerPaused: boolean;
  verdict: Verdict | null;
  error: string | null;
  skippedTurns: number;
};

function isSide(x: unknown): x is Side {
  return x === "FOR" || x === "AGAINST";
}

function isPhase(x: unknown): x is Phase {
  return x === "setup" || x === "debating" || x === "finished";
}

function turnTimerSecondsFromUnknown(x: unknown): TurnTimerSeconds {
  return x === 300 ? 300 : 180;
}

function turnRoundsFromUnknown(x: unknown): TurnRounds {
  return x === 5 ? 5 : 3;
}

function isRoundData(x: unknown): x is RoundData {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.round === "number" &&
    typeof o.playerMove === "string" &&
    (o.opponentMove === null || typeof o.opponentMove === "string")
  );
}

export function loadDebatelySession(): DebatelyPersisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;
    if (p.v !== 1) return null;
    if (!isPhase(p.phase)) return null;
    if (typeof p.nickname !== "string") return null;
    if (typeof p.topic !== "string") return null;
    if (!isSide(p.playerSide)) return null;
    if (!Array.isArray(p.history) || !p.history.every(isRoundData)) return null;
    if (typeof p.currentRound !== "number") return null;
    const turnRounds = turnRoundsFromUnknown(p.turnRounds);
    if (typeof p.inputText !== "string") return null;
    if (typeof p.timer !== "number") return null;
    const turnTimerSeconds = turnTimerSecondsFromUnknown(p.turnTimerSeconds);
    const timerPaused =
      typeof p.timerPaused === "boolean" ? p.timerPaused : false;
    if (p.verdict !== null && typeof p.verdict !== "object") return null;
    if (p.error !== null && typeof p.error !== "string") return null;
    if (typeof p.skippedTurns !== "number") return null;

    return {
      v: 1,
      phase: p.phase,
      nickname: p.nickname,
      topic: p.topic,
      playerSide: p.playerSide,
      history: p.history as RoundData[],
      currentRound: Math.max(1, Math.min(turnRounds, Math.floor(p.currentRound))),
      turnRounds,
      inputText: p.inputText,
      timer: Math.max(0, Math.min(turnTimerSeconds, Math.floor(p.timer))),
      turnTimerSeconds,
      timerPaused,
      verdict: p.verdict as Verdict | null,
      error: p.error,
      skippedTurns: p.skippedTurns,
    };
  } catch {
    return null;
  }
}

export function saveDebatelySession(data: DebatelyPersisted): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota or private mode
  }
}

export function clearDebatelySession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
