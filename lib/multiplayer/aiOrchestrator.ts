import { runFactcheck } from "@/lib/ai/factcheck";
import { runVerdict } from "@/lib/ai/verdict";
import { debatelyLog } from "@/lib/debatelyLog";
import { SURRENDER_PLAYER_MOVE } from "@/lib/debateSurrender";
import {
  applyFactcheckResult,
  applyVerdict,
  getSession,
} from "@/lib/multiplayer/store";
import { viewHistoryFromSide } from "@/lib/multiplayer/sessionLogic";
import type { Side } from "@/lib/types";
import type { MultiplayerSession, PlayerSlot, SlotId } from "@/lib/multiplayer/types";

const inflightFactcheck = new Set<string>();
const inflightVerdict = new Set<string>();

function displayNameForVerdict(player: PlayerSlot): string {
  const trimmed = (player.nickname ?? "").trim();
  if (trimmed.length > 0) return trimmed.slice(0, 32);
  if (player.side === "FOR" || player.side === "AGAINST") {
    return `${player.side} debater`;
  }
  return player.slot === "A" ? "Host" : "Guest";
}

function previousMoveTextFor(
  session: MultiplayerSession,
  side: Side,
  round: number,
): string {
  const opposite: Side = side === "FOR" ? "AGAINST" : "FOR";
  if (round > 1) {
    const prev = session.history[round - 2];
    if (prev) {
      return opposite === "FOR" ? (prev.forMove ?? "") : (prev.againstMove ?? "");
    }
  }
  // Same-round opposite (the other side already moved this round).
  const cur = session.history[round - 1];
  if (cur) {
    return opposite === "FOR" ? (cur.forMove ?? "") : (cur.againstMove ?? "");
  }
  return "";
}

export async function runFactcheckForMove(args: {
  sessionId: string;
  side: Side;
  round: number;
}): Promise<void> {
  const key = `${args.sessionId}:${args.round}:${args.side}`;
  if (inflightFactcheck.has(key)) return;
  inflightFactcheck.add(key);
  try {
    const session = getSession(args.sessionId);
    if (!session) return;
    const round = session.history[args.round - 1];
    if (!round) return;
    const moveText =
      args.side === "FOR" ? (round.forMove ?? "") : (round.againstMove ?? "");
    if (!moveText) return;
    if (moveText.trim() === "[Turn skipped — time expired]") return;
    const previousMoveText = previousMoveTextFor(session, args.side, args.round);
    const fc = await runFactcheck({
      topic: session.settings.topic,
      side: args.side,
      speakerSide: args.side,
      moveText,
      speaker: previousMoveText.trim().length === 0 ? "player" : "opponent",
      previousMoveText,
      round: args.round,
    });
    applyFactcheckResult({
      sessionId: args.sessionId,
      round: args.round,
      side: args.side,
      factcheck: fc,
    });
  } catch (err) {
    debatelyLog("factcheck", "error", "multiplayer factcheck failed", {
      err: err instanceof Error ? err.message : String(err),
      sessionId: args.sessionId,
    });
  } finally {
    inflightFactcheck.delete(key);
  }
}

export async function runVerdictForSession(args: {
  sessionId: string;
  fromSlot?: SlotId;
}): Promise<void> {
  if (inflightVerdict.has(args.sessionId)) return;
  inflightVerdict.add(args.sessionId);
  try {
    const session = getSession(args.sessionId);
    if (!session) return;
    if (session.verdict) return;
    // Build a player POV view: anchor "player" to slot A by default.
    const anchorSlot: SlotId = args.fromSlot ?? "A";
    const anchor = anchorSlot === "A" ? session.players[0] : session.players[1];
    const other = anchorSlot === "A" ? session.players[1] : session.players[0];
    if (!anchor.side || !other.side) return;
    const history = viewHistoryFromSide(session.history, anchor.side).map(
      (r) => ({
        round: r.round,
        playerMove: r.playerMove,
        aiFactcheckPlayer: r.aiFactcheckPlayer,
        opponentMove: r.opponentMove,
        aiFactcheckOpponent: r.aiFactcheckOpponent,
      }),
    );
    const skippedTurns = session.skippedTurns[anchor.side];
    const playerConceded =
      session.concededBy === anchorSlot ||
      history.some((r) => r.playerMove.trim() === SURRENDER_PLAYER_MOVE);
    const verdict = await runVerdict({
      topic: session.settings.topic,
      playerSide: anchor.side,
      opponentSide: other.side,
      history,
      skippedTurns,
      playerConceded,
      playerName: displayNameForVerdict(anchor),
      opponentName: displayNameForVerdict(other),
      mode: "multiplayer",
    });
    applyVerdict({ sessionId: args.sessionId, verdict });
  } catch (err) {
    debatelyLog("verdict", "error", "multiplayer verdict failed", {
      err: err instanceof Error ? err.message : String(err),
      sessionId: args.sessionId,
    });
  } finally {
    inflightVerdict.delete(args.sessionId);
  }
}
