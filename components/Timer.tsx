"use client";

type Props = {
  seconds: number;
  maxSeconds?: number;
};

export function Timer({ seconds, maxSeconds = 120 }: Props) {
  const pct = Math.max(0, Math.min(100, (seconds / maxSeconds) * 100));
  const urgent = seconds <= 30;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const label = `${m}:${s.toString().padStart(2, "0")}`;

  return (
    <div className="flex min-w-[140px] flex-col gap-1">
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
          urgent ? "text-red-400" : "text-zinc-300"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
