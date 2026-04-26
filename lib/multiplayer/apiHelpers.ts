import { NextResponse } from "next/server";
import {
  getSession,
  publicView,
  resolveSlotByToken,
  hashPlayerToken,
} from "@/lib/multiplayer/store";
import type { MultiplayerSession, SlotId } from "@/lib/multiplayer/types";

export const PLAYER_TOKEN_HEADER = "x-player-token";

export function readPlayerToken(request: Request): string | null {
  const header = request.headers.get(PLAYER_TOKEN_HEADER);
  if (!header) return null;
  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type AuthFailure = {
  ok: false;
  status: number;
  reason: string;
};
type AuthSuccess = {
  ok: true;
  session: MultiplayerSession;
  slot: SlotId;
};

export function requireSlot(
  sessionId: string,
  request: Request,
): AuthSuccess | AuthFailure {
  const session = getSession(sessionId);
  if (!session) {
    return { ok: false, status: 404, reason: "Session not found." };
  }
  const token = readPlayerToken(request);
  if (!token) {
    return { ok: false, status: 401, reason: "Missing player token." };
  }
  const slot = resolveSlotByToken(session, token);
  if (!slot) {
    return { ok: false, status: 403, reason: "Token does not match a slot in this session." };
  }
  return { ok: true, session, slot };
}

export function jsonError(reason: string, status: number) {
  return NextResponse.json({ error: reason }, { status });
}

export function publicViewForRequest(
  session: MultiplayerSession,
  request: Request,
): ReturnType<typeof publicView> {
  const token = readPlayerToken(request);
  return publicView(session, token ? hashPlayerToken(token) : null);
}
