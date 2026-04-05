/** Trims text to at most `maxWords` words; adds ellipsis if truncated. */
export function truncateToMaxWords(text: string, maxWords: number): string {
  const t = text.trim();
  if (!t) return t;
  const words = t.split(/\s+/);
  if (words.length <= maxWords) return t;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
