export const VISITOR_STORAGE_KEY = "debately:visitor:v1";
export const VISITOR_COOKIE_NAME = "debately_vid";
export const VISITOR_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

const MIN_VISITOR_ID_LENGTH = 8;
const MAX_VISITOR_ID_LENGTH = 128;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function normalizeVisitorId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (
    trimmed.length < MIN_VISITOR_ID_LENGTH ||
    trimmed.length > MAX_VISITOR_ID_LENGTH
  ) {
    return null;
  }
  if (!VISITOR_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}
