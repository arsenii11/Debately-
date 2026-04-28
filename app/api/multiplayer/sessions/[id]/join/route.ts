import { NextResponse } from "next/server";
import { joinExistingSession, hashPlayerToken } from "@/lib/multiplayer/store";
import { publicView } from "@/lib/multiplayer/store";
import { readPlayerToken } from "@/lib/multiplayer/apiHelpers";
import {
  INVALID_LOBBY_LINK_MESSAGE,
  SESSION_GONE_MESSAGE,
  isPlausibleSessionId,
} from "@/lib/multiplayer/sessionIdFormat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Body = { nickname?: string };

export async function POST(request: Request, { params }: Params) {
  const raw = (await params).id;
  const id = raw?.trim() ?? "";
  if (!isPlausibleSessionId(id)) {
    return NextResponse.json(
      { error: "invalid_link", message: INVALID_LOBBY_LINK_MESSAGE },
      { status: 400 },
    );
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }
  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim().slice(0, 32) : "";
  if (!nickname) {
    return NextResponse.json({ error: "Nickname required." }, { status: 400 });
  }
  const existingToken = readPlayerToken(request);
  const result = joinExistingSession({
    sessionId: id,
    nickname,
    existingToken,
  });
  if (result.kind === "error") {
    if (result.reason === "Session not found.") {
      return NextResponse.json(
        { error: "session_gone", message: SESSION_GONE_MESSAGE },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: result.reason }, { status: 403 });
  }
  if (result.kind === "already") {
    const tokenHash = existingToken ? hashPlayerToken(existingToken) : null;
    return NextResponse.json({
      sessionId: id,
      slot: result.slot,
      playerToken: existingToken,
      session: publicView(result.session, tokenHash),
    });
  }
  return NextResponse.json({
    sessionId: id,
    slot: result.slot,
    playerToken: result.playerToken,
    session: publicView(result.session, hashPlayerToken(result.playerToken)),
  });
}
