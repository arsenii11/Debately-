import type { SpecLike, SpecReactionKind } from "@/lib/multiplayer/types";

/** Unique display names, stable sort (from all session reactions). */
export function uniqueSpectatorNamesFromLikes(likes: SpecLike[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of likes) {
    const t = l.name?.trim() ?? "";
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function reactionHoverTitle(
  kind: SpecReactionKind,
  names: string[],
  youHaveThis: boolean,
): string {
  if (names.length === 0) {
    return youHaveThis
      ? "Click to remove your reaction"
      : "No one yet";
  }
  const head: Record<SpecReactionKind, string> = {
    like: "Liked by",
    dislike: "Disliked by",
    cackle: "Cackles from",
    fire: "Fire from",
  };
  const line = `${head[kind] ?? "Reactions"}: ${names.join(", ")}`;
  if (youHaveThis) {
    return `${line} — click to remove yours`;
  }
  return line;
}
