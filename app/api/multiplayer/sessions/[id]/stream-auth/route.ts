import { NextResponse } from "next/server";
import { readPlayerToken } from "@/lib/multiplayer/apiHelpers";
import {
  getSession,
  resolveSlotByToken,
} from "@/lib/multiplayer/store";
import {
  INVALID_LOBBY_LINK_MESSAGE,
  SESSION_GONE_MESSAGE,
  isPlausibleSessionId,
} from "@/lib/multiplayer/sessionIdFormat";
import {
  STREAM_AUTH_COOKIE_MAX_AGE_SEC,
  streamAuthCookieName,
  streamPath,
} from "@/lib/multiplayer/streamAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.trim().toLowerCase();
  if (proto === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request, { params }: Params) {
  const raw = (await params).id;
  const id = raw?.trim() ?? "";
  if (!isPlausibleSessionId(id)) {
    return NextResponse.json(
      { error: "invalid_link", message: INVALID_LOBBY_LINK_MESSAGE },
      { status: 400 },
    );
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json(
      { error: "session_gone", message: SESSION_GONE_MESSAGE },
      { status: 404 },
    );
  }

  const playerToken = readPlayerToken(request);
  if (!playerToken || !resolveSlotByToken(session, playerToken)) {
    return NextResponse.json({ error: "Invalid player token." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(streamAuthCookieName(id), playerToken, {
    httpOnly: true,
    path: streamPath(id),
    maxAge: STREAM_AUTH_COOKIE_MAX_AGE_SEC,
    sameSite: "lax",
    secure: isSecureRequest(request),
  });
  return response;
}
