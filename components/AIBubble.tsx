"use client";

import type { Side } from "@/lib/types";

type Props = {
  opponentSide: Side;
  text: string | null;
  thinking?: boolean;
  label?: string;
  opponentName?: string;
  avatarLabel?: string;
};

export function AIBubble({
  opponentSide,
  text,
  thinking,
  label,
  opponentName = "Debately",
  avatarLabel = "AI",
}: Props) {
  return (
    <div className="flex w-full max-w-[min(100%,28rem)] flex-row-reverse items-end gap-2 self-end">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 to-pink-600 text-xs font-bold text-white">
        {avatarLabel}
      </div>
      <div className="min-w-0 flex-1 text-right">
        <div className="mb-1 flex items-center justify-end gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              opponentSide === "FOR"
                ? "bg-emerald-500/25 text-emerald-300"
                : "bg-rose-500/25 text-rose-300"
            }`}
          >
            {opponentSide}
          </span>
          <span className="text-sm font-semibold text-zinc-200">
            {opponentName}
          </span>
        </div>
        <div
          className={`rounded-[14px_3px_14px_14px] border px-4 py-3 text-left text-sm leading-relaxed text-zinc-100 ${
            opponentSide === "FOR"
              ? "border-emerald-500/35 bg-emerald-950/40"
              : "border-rose-500/35 bg-rose-950/35"
          }`}
        >
          {thinking ? (
            <span className="flex items-center gap-2 text-zinc-400">
              <span className="flex gap-1">
                <span
                  className={`h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.2s] ${
                    opponentSide === "FOR" ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                <span
                  className={`h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.1s] ${
                    opponentSide === "FOR" ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                <span
                  className={`h-1.5 w-1.5 animate-bounce rounded-full ${
                    opponentSide === "FOR" ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
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
