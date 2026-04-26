"use client";

import type { SpecLike } from "@/lib/multiplayer/types";
import { uniqueSpectatorNamesFromLikes } from "./spectatorMeta";

type Props = {
  me: string;
  likes: SpecLike[];
};

export function SpectatorAudienceBar({ me, likes }: Props) {
  const all = uniqueSpectatorNamesFromLikes(likes);
  const meLower = me.toLowerCase();
  const others = all.filter((n) => n.toLowerCase() !== meLower);
  return (
    <div className="text-right">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        You
      </p>
      <p className="truncate text-sm font-medium text-zinc-100" title={me}>
        {me}
      </p>
      {others.length > 0 ? (
        <div className="mt-2 border-t border-zinc-800/80 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Also reacted
          </p>
          <p
            className="mt-0.5 max-h-24 overflow-y-auto text-xs leading-relaxed text-zinc-300"
            title={others.join(", ")}
          >
            {others.join(" · ")}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-[10px] text-zinc-500">Solo viewer until others react</p>
      )}
    </div>
  );
}
