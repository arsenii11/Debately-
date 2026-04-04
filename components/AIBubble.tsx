"use client";

import type { Side } from "@/lib/types";

type Props = {
  opponentSide: Side;
  text: string | null;
  thinking?: boolean;
  label?: string;
};

export function AIBubble({
  opponentSide,
  text,
  thinking,
  label,
}: Props) {
  return (
    <div className="flex w-full max-w-[min(100%,28rem)] flex-row-reverse items-end gap-2 self-end">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 to-pink-600 text-xs font-bold text-white">
        AI
      </div>
      <div className="min-w-0 flex-1 text-right">
        <div className="mb-1 flex items-center justify-end gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              opponentSide === "AGAINST"
                ? "bg-pink-500/25 text-pink-300"
                : "bg-fuchsia-500/25 text-fuchsia-300"
            }`}
          >
            {opponentSide}
          </span>
          <span className="text-sm font-semibold text-zinc-200">Opponent</span>
        </div>
        <div className="rounded-[14px_3px_14px_14px] border border-pink-500/30 bg-pink-950/35 px-4 py-3 text-left text-sm leading-relaxed text-zinc-100">
          {thinking ? (
            <span className="flex items-center gap-2 text-zinc-400">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pink-400" />
              </span>
              {label ?? "Thinking…"}
            </span>
          ) : (
            text
          )}
        </div>
      </div>
    </div>
  );
}
