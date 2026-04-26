"use client";

const TOKEN_MAP_KEY = "debately:mp:tokens";
const NICKNAME_KEY = "debately:mp:nickname";

type TokenMap = Record<string, string>;

function readTokenMap(): TokenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TOKEN_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as TokenMap;
  } catch {
    return {};
  }
}

function writeTokenMap(map: TokenMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_MAP_KEY, JSON.stringify(map));
  } catch {
    /* quota or disabled storage — ignore */
  }
}

export function getPlayerToken(sessionId: string): string | null {
  const map = readTokenMap();
  const t = map[sessionId];
  return typeof t === "string" && t.length > 0 ? t : null;
}

export function setPlayerToken(sessionId: string, token: string): void {
  const map = readTokenMap();
  map[sessionId] = token;
  writeTokenMap(map);
}

export function clearPlayerToken(sessionId: string): void {
  const map = readTokenMap();
  if (sessionId in map) {
    delete map[sessionId];
    writeTokenMap(map);
  }
}

export function getNickname(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NICKNAME_KEY)?.slice(0, 32) ?? "";
  } catch {
    return "";
  }
}

export function setNickname(value: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = value.trim().slice(0, 32);
    if (trimmed) window.localStorage.setItem(NICKNAME_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export function authHeaders(sessionId: string): HeadersInit {
  const token = getPlayerToken(sessionId);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["X-Player-Token"] = token;
  return headers;
}
