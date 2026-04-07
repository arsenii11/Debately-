"use client";

import type { Side } from "@/lib/types";

type Props = {
  name: string;
  side: Side;
  text: string;
};

export function PlayerBubble({ name, side, text }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex w-full max-w-[min(100%,28rem)] flex-row items-end gap-2 self-start">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
          side === "FOR" ? "bg-emerald-600" : "bg-rose-600"
        }`}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-200">{name}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              side === "FOR"
                ? "bg-emerald-500/25 text-emerald-300"
                : "bg-rose-500/25 text-rose-300"
            }`}
          >
            {side}
          </span>
        </div>
        <div
          className={`rounded-[3px_14px_14px_14px] border px-4 py-3 text-sm leading-relaxed text-zinc-100 ${
            side === "FOR"
              ? "border-emerald-500/35 bg-emerald-950/45"
              : "border-rose-500/35 bg-rose-950/40"
          }`}
        >
          {text}
        </div>
      </div>
    </div>
  );
}
