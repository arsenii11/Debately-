import { SESSION_ID_LENGTH } from "@/lib/multiplayer/sessionIdFormat";

const STREAM_COOKIE_PREFIX = "debately_mp_stream_";
export const STREAM_AUTH_COOKIE_MAX_AGE_SEC = 60 * 60;

export function streamAuthCookieName(sessionId: string): string {
  return `${STREAM_COOKIE_PREFIX}${sessionId.slice(0, SESSION_ID_LENGTH)}`;
}

export function streamPath(sessionId: string): string {
  return `/api/multiplayer/sessions/${sessionId}/stream`;
}
