"use client";

import type { FactCheck } from "@/lib/types";

const statusStyles = {
  verified: "text-emerald-400",
  disputed: "text-amber-400",
  false: "text-red-400",
} as const;

type Props = {
  variant: "player" | "opponent";
  data: FactCheck;
};

export function FactCheckCard({ variant, data }: Props) {
  const title =
    variant === "player" ? "JUDGE — your argument" : "JUDGE — opponent";

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-amber-500/25 bg-zinc-900/90 px-4 py-4 shadow-lg shadow-black/20">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-amber-500/90">
          {title}
        </p>
        <ul className="mt-3 space-y-3">
          {data.facts.length > 0 ? (
            data.facts.map((f, i) => (
              <li key={i} className="text-sm">
                <p className={`font-medium ${statusStyles[f.status]}`}>
                  ● {f.claim}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {f.comment}
                </p>
              </li>
            ))
          ) : (
            <li className="text-sm text-zinc-400">
              No concrete factual claims detected.
            </li>
          )}
        </ul>
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Score</span>
            <span className="font-mono text-zinc-200">
              {Math.min(100, Math.max(0, Math.round(data.relevance)))}/100
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-amber-500/70"
              style={{ width: `${Math.min(100, data.relevance)}%` }}
            />
          </div>
        </div>
        {(data.flags?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.flags.map((fl) => (
              <span
                key={fl}
                className="rounded-md bg-yellow-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-yellow-200/90"
              >
                {fl.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
