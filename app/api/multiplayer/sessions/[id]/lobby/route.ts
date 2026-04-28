import { NextResponse } from "next/server";
import { applyLobbyUpdate } from "@/lib/multiplayer/store";
import {
  jsonError,
  publicViewForRequest,
  requireSlot,
} from "@/lib/multiplayer/apiHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type Body = {
  topic?: string | null;
  side?: "FOR" | "AGAINST" | null;
  turnRounds?: number | null;
  turnTimerSeconds?: number | null;
  sideSelectionLockedByHost?: boolean;
  nickname?: string;
  ready?: boolean;
};

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = requireSlot(id, request);
  if (!auth.ok) return jsonError(auth.reason, auth.status);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const result = applyLobbyUpdate({
    sessionId: id,
    slot: auth.slot,
    update: body,
  });
  if (result.kind === "error") return jsonError(result.reason, 400);
  return NextResponse.json({
    started: result.started,
    session: publicViewForRequest(result.session, request),
  });
}
