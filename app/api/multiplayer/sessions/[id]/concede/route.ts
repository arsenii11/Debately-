import { NextResponse } from "next/server";
import { applyConcede } from "@/lib/multiplayer/store";
import {
  jsonError,
  publicViewForRequest,
  requireSlot,
} from "@/lib/multiplayer/apiHelpers";
import { runVerdictForSession } from "@/lib/multiplayer/aiOrchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireSlot(id, request);
  if (!auth.ok) return jsonError(auth.reason, auth.status);
  const result = await applyConcede({ sessionId: id, slot: auth.slot });
  if (result.kind === "error") return jsonError(result.reason, 400);
  void runVerdictForSession({ sessionId: id, fromSlot: auth.slot });
  return NextResponse.json({
    session: publicViewForRequest(result.session, request),
  });
}
