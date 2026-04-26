"use client";

import { useState } from "react";
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
    variant === "player" ? "JUDGE — your argument" : "JUDGE — Debately";
  const [expanded, setExpanded] = useState(false);
  const score = Math.min(100, Math.max(0, Math.round(data.relevance)));
  const firstClaim = data.facts[0]?.claim?.trim() ?? "";
  const shortClaim =
    firstClaim.length > 96 ? `${firstClaim.slice(0, 93)}...` : firstClaim;
  const preview =
    data.facts.length === 0
      ? "No concrete factual claims detected."
      : data.facts.length === 1
        ? shortClaim
        : `${shortClaim} (+${data.facts.length - 1} more)`;

  return (
    <div className="mx-auto w-full min-w-0 max-w-md">
      <div className="rounded-2xl border border-amber-500/25 bg-zinc-900/90 px-4 py-4 shadow-lg shadow-black/20">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-amber-500/90">
          {title}
        </p>
        <p className="mt-2 break-words text-sm font-medium text-zinc-200">
          {preview}
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
          Signed by Judge
        </p>
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Score</span>
            <span className="font-mono text-zinc-200">
              {score}/100
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-amber-500/70"
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 cursor-pointer rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100"
        >
          {expanded ? "Hide review" : "Show review"}
        </button>
        {expanded && (
          <>
            <ul className="mt-3 space-y-3">
              {data.facts.length > 0 ? (
                data.facts.map((f, i) => (
                  <li key={i} className="text-sm">
                    <p
                      className={`break-words font-medium [overflow-wrap:anywhere] ${statusStyles[f.status]}`}
                    >
                      ● {f.claim}
                    </p>
                    <p className="mt-1 break-words text-xs leading-relaxed text-zinc-500">
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
          </>
        )}
      </div>
    </div>
  );
}
