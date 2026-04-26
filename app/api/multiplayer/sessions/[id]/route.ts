import { NextResponse } from "next/server";
import {
  publicViewForRequest,
} from "@/lib/multiplayer/apiHelpers";
import { getSession, touchSession, resolveSlotByToken } from "@/lib/multiplayer/store";
import { readPlayerToken } from "@/lib/multiplayer/apiHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  const token = readPlayerToken(request);
  if (token) {
    const slot = resolveSlotByToken(session, token);
    if (slot) {
      const refreshed = touchSession({ sessionId: id, slot });
      if (refreshed) {
        return NextResponse.json(publicViewForRequest(refreshed, request));
      }
    }
  }
  return NextResponse.json(publicViewForRequest(session, request));
}
