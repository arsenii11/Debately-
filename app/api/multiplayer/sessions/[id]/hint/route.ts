import { NextResponse } from "next/server";
import { runHint } from "@/lib/ai/hint";
import { consumeHintForSlot } from "@/lib/multiplayer/store";
import {
  jsonError,
  publicViewForRequest,
  requireSlot,
} from "@/lib/multiplayer/apiHelpers";
import { isPlayerOnTurn, viewHistoryFromSide } from "@/lib/multiplayer/sessionLogic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireSlot(id, request);
  if (!auth.ok) return jsonError(auth.reason, auth.status);
  const session = auth.session;
  if (!isPlayerOnTurn(session, auth.slot)) {
    return jsonError("Hints are only available on your own turn.", 400);
  }
  const me = session.players.find((p) => p.slot === auth.slot)!;
  if (!me.side) return jsonError("Side not assigned yet.", 400);
  const opponent = session.players.find((p) => p.slot !== auth.slot)!;
  if (!opponent.side) return jsonError("Opponent missing.", 400);

  const result = await consumeHintForSlot({ sessionId: id, slot: auth.slot });
  if (result.kind === "error") return jsonError(result.reason, 429);

  const history = viewHistoryFromSide(result.session.history, me.side);
  const lastOpponentMove =
    [...history].reverse().find((r) => r.opponentMove)?.opponentMove ?? "";

  try {
    const hint = await runHint({
      topic: result.session.settings.topic,
      mySide: me.side,
      opponentSide: opponent.side,
      history: history.map((r) => ({
        round: r.round,
        playerMove: r.playerMove,
        aiFactcheckPlayer: r.aiFactcheckPlayer,
        opponentMove: r.opponentMove,
        aiFactcheckOpponent: r.aiFactcheckOpponent,
      })),
      lastOpponentMove,
    });
    return NextResponse.json({
      hint,
      session: publicViewForRequest(result.session, request),
    });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Hint generation failed.",
      500,
    );
  }
}
