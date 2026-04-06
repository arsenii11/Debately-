/**
 * Server-side logs for AI routes (visible in `next dev` / Docker logs).
 * Prefix keeps grepping simple: `docker compose logs -f app | grep debately`
 */
export function debatelyLog(
  route: "factcheck" | "verdict" | "opponent" | "gemini",
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
): void {
  const prefix = `[debately:${route}]`;
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  const line = `${prefix} ${message}${suffix}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Prevent huge payloads from flooding container logs. */
export function clipForLog(value: string, max = 1200): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[truncated ${text.length - max} chars]`;
}
