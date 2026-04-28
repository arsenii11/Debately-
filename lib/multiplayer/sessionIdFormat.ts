export const SESSION_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SESSION_ID_LENGTH = 10;

const SESSION_ID_RE = new RegExp(
  `^[${SESSION_ID_ALPHABET}]{${SESSION_ID_LENGTH}}$`,
);

export function isPlausibleSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id.trim());
}

export const INVALID_LOBBY_LINK_MESSAGE =
  "This link is not a valid lobby ID. Check for a typo, or get a new link from the host.";

export const SESSION_GONE_MESSAGE =
  "This debate is no longer available. The link may be old, the ID may be wrong, or the room may have been removed after inactivity.";

export function messageFromErrorBody(
  text: string,
  status: number,
  fallback: string,
): string {
  try {
    const j = JSON.parse(text) as { message?: string; error?: string };
    if (typeof j.message === "string" && j.message.trim()) return j.message;
    if (typeof j.error === "string" && j.error.trim()) {
      if (j.error === "invalid_link") return INVALID_LOBBY_LINK_MESSAGE;
      if (j.error === "session_gone") return SESSION_GONE_MESSAGE;
      return j.error;
    }
  } catch {
    /* ignore */
  }
  if (status === 400) return INVALID_LOBBY_LINK_MESSAGE;
  if (status === 404) return SESSION_GONE_MESSAGE;
  return text.trim() || fallback;
}

export async function messageFromSessionGetFailure(
  res: Response,
): Promise<string> {
  const text = await res.text();
  return messageFromErrorBody(text, res.status, "Failed to load session.");
}
