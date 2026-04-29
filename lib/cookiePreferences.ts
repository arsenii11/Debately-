/**
 * First-party cookies + localStorage mirror: anonymous user id and consent
 * (analytics / essential-only). Client-only; call from "use client" or effects.
 */

const LS_KEY = "debately:preferences:v1";

const COOKIE_UID = "debately_uid";
const COOKIE_AN = "debately_analytics";

const ONE_YEAR = 60 * 60 * 24 * 365;

export type ConsentChoice = "all" | "necessary" | "unset";

export type UserPreferences = {
  v: 1;
  /** Stable anonymous id for this browser (set when user saves consent). */
  anonId: string;
  /** all = allow analytics; necessary = no analytics; unset = not chosen. */
  consent: ConsentChoice;
  /** ISO 8601 when consent was last saved. */
  updatedAt: string;
};

function generateAnonId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function setBrowserCookie(
  name: string,
  value: string,
  maxAgeSec: number,
): void {
  if (typeof document === "undefined") return;
  const isHttps =
    typeof location !== "undefined" && location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(
    name,
  )}=${encodeURIComponent(
    value,
  )}; Path=/; Max-Age=${String(maxAgeSec)}; SameSite=Lax${secure}`;
}

function deleteBrowserCookie(name: string): void {
  if (typeof document === "undefined") return;
  const isHttps =
    typeof location !== "undefined" && location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(
    name,
  )}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function syncToCookies(prefs: UserPreferences | null): void {
  if (!prefs || prefs.consent === "unset") {
    deleteBrowserCookie(COOKIE_UID);
    deleteBrowserCookie(COOKIE_AN);
    return;
  }
  setBrowserCookie(COOKIE_UID, prefs.anonId, ONE_YEAR);
  setBrowserCookie(COOKIE_AN, prefs.consent === "all" ? "1" : "0", ONE_YEAR);
}

/**
 * Re-read localStorage and re-set first-party cookies (e.g. after cross-tab changes).
 */
export function ensureCookiesMirrorStorage(): void {
  const p = readLocalStorage();
  if (p && p.consent !== "unset") {
    syncToCookies(p);
  } else {
    syncToCookies(null);
  }
}

function readLocalStorage(): UserPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as UserPreferences;
    if (p.v !== 1 || typeof p.anonId !== "string" || p.anonId.length < 4) {
      return null;
    }
    if (p.consent !== "all" && p.consent !== "necessary" && p.consent !== "unset") {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

function writeLocalStorage(prefs: UserPreferences | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!prefs) {
      localStorage.removeItem(LS_KEY);
      return;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode, quota */
  }
}

export function loadUserPreferences(): UserPreferences | null {
  return readLocalStorage();
}

export function consentIsUnset(): boolean {
  const p = readLocalStorage();
  return !p || p.consent === "unset";
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const esc = name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${esc}=([^;]*)`),
  );
  if (!m?.[1]) return null;
  return decodeURIComponent(m[1]!.replaceAll("+", " ").trim());
}

export function allowsAnalyticsFromPrefs(): boolean {
  const p = readLocalStorage();
  return p?.consent === "all";
}

/**
 * Whether Plausible (stats) may run. Prefer first-party `debately_analytics`
 * cookie, then localStorage, so the stats script follows the same consent as cookies.
 */
export function allowsAnalyticsForStats(): boolean {
  const c = getCookieValue(COOKIE_AN);
  if (c === "1") return true;
  if (c === "0") return false;
  return allowsAnalyticsFromPrefs();
}

export function saveConsentChoice(choice: "all" | "necessary"): void {
  const now = new Date().toISOString();
  const existing = readLocalStorage();
  const anonId = existing?.anonId && existing.anonId.length > 4
    ? existing.anonId
    : generateAnonId();
  const prefs: UserPreferences = {
    v: 1,
    anonId,
    consent: choice,
    updatedAt: now,
  };
  writeLocalStorage(prefs);
  syncToCookies(prefs);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("debately:consent-changed"));
  }
}

/**
 * Exposed for support / "reset" flows (optional future UI). Clears local + cookies.
 */
export function clearUserPreferencesForTesting(): void {
  writeLocalStorage(null);
  if (typeof window === "undefined") return;
  deleteBrowserCookie(COOKIE_UID);
  deleteBrowserCookie(COOKIE_AN);
}

export const COOKIE_NAMES = { uid: COOKIE_UID, analytics: COOKIE_AN } as const;
