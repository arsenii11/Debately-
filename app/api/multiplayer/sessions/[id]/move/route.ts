import { NextResponse } from "next/server";
import {
  applyMove,
  expireDeadlineIfDue,
  getSession,
} from "@/lib/multiplayer/store";
import {
  jsonError,
  publicViewForRequest,
  requireSlot,
} from "@/lib/multiplayer/apiHelpers";
import {
  runFactcheckForMove,
  runVerdictForSession,
} from "@/lib/multiplayer/aiOrchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = { text?: string };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireSlot(id, request);
  if (!auth.ok) return jsonError(auth.reason, auth.status);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }
  const text = typeof body.text === "string" ? body.text : "";

  // Auto-skip if the deadline has lapsed before the player got their move in.
  const expiry = await expireDeadlineIfDue(id);

  // Re-fetch latest session so we use post-expiry state.
  const session = await getSession(id);
  if (!session) return jsonError("Session not found.", 404);
  if (session.state !== "live") {
    if (session.state === "finished" && !session.verdict) {
      void runVerdictForSession({
        sessionId: id,
        fromSlot: expiry.expiredSlot ?? auth.slot,
      });
    }
    return jsonError("Debate is not in progress.", 400);
  }

  const sideThatMoves = session.currentSide;
  const roundThatMoves = session.currentRound;

  const result = await applyMove({
    sessionId: id,
    slot: auth.slot,
    text,
    skipped: false,
  });
  if (result.kind === "error") return jsonError(result.reason, 400);

  // Schedule factcheck for the move just submitted (do not await).
  void runFactcheckForMove({
    sessionId: id,
    side: sideThatMoves,
    round: roundThatMoves,
  });

  // If the debate transitioned to finished, kick off the verdict generation.
  if (result.session.state === "finished" && !result.session.verdict) {
    void runVerdictForSession({ sessionId: id, fromSlot: auth.slot });
  }

  return NextResponse.json({
    finished: result.finished,
    session: publicViewForRequest(result.session, request),
  });
}
