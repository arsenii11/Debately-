"use client";

import { DEFAULT_TURN_TIMER_SECONDS } from "@/lib/types";

type Props = {
  seconds: number;
  maxSeconds?: number;
  paused?: boolean;
};

export function Timer({
  seconds,
  maxSeconds = DEFAULT_TURN_TIMER_SECONDS,
  paused = false,
}: Props) {
  const pct = Math.max(0, Math.min(100, (seconds / maxSeconds) * 100));
  const urgent = !paused && seconds <= Math.min(45, Math.floor(maxSeconds * 0.25));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const label = `${m}:${s.toString().padStart(2, "0")}`;

  return (
    <div
      className={`flex min-w-[140px] flex-col gap-1 ${paused ? "opacity-55" : ""}`}
    >
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${
            urgent ? "bg-red-500" : "bg-indigo-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-right font-mono text-sm tabular-nums ${
          urgent ? "text-red-400" : paused ? "text-zinc-500" : "text-zinc-300"
        }`}
      >
        {paused ? `${label} · paused` : label}
      </span>
    </div>
  );
}
