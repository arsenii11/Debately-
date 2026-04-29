/**
 * Cuts off chain-of-thought / scratchpad that models sometimes emit after JSON
 * or (rarely) inside the "text" string.
 */
export function stripReasoningLeaks(s: string): string {
  if (!s) return s;
  let t = s;
  const patterns: RegExp[] = [
    /\s*\[Thoughts\]\s*:/i,
    /\s*\[Thought\]\s*:/i,
    /\s*\[Internal[^\]]*]\s*:/i,
    /\s*---+\s*Thoughts?\s*---+/i,
    /\n\s*Note:\s*The user'?s? input was\b/i,
    /\n+\s*I need to:\s*/i,
  ];
  let min = t.length;
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m.index != null && m.index < min) min = m.index;
  }
  if (min < t.length) t = t.slice(0, min);
  return t.trim();
}
