import { NextResponse } from "next/server";
import {
  publicViewForRequest,
} from "@/lib/multiplayer/apiHelpers";
import { getSession, touchSession, resolveSlotByToken } from "@/lib/multiplayer/store";
import { readPlayerToken } from "@/lib/multiplayer/apiHelpers";
import {
  INVALID_LOBBY_LINK_MESSAGE,
  SESSION_GONE_MESSAGE,
  isPlausibleSessionId,
} from "@/lib/multiplayer/sessionIdFormat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const raw = (await params).id;
  const id = raw?.trim() ?? "";
  if (!isPlausibleSessionId(id)) {
    return NextResponse.json(
      { error: "invalid_link", message: INVALID_LOBBY_LINK_MESSAGE },
      { status: 400 },
    );
  }
  const session = getSession(id);
  if (!session) {
    return NextResponse.json(
      { error: "session_gone", message: SESSION_GONE_MESSAGE },
      { status: 404 },
    );
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
