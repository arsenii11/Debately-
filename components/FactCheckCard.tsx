"use client";

import { useEffect, useMemo, useState } from "react";
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

function buildBonusCopy(data: FactCheck): {
  label: string;
  text: string;
  tone: string;
} {
  const score = Math.min(100, Math.max(0, Math.round(data.relevance)));
  const factCount = data.facts.length;
  const disputedCount = data.facts.filter((f) => f.status !== "verified").length;
  const seed = score + factCount * 17 + disputedCount * 31 + data.flags.length * 13;
  const pool = [
    {
      label: "Argument streak",
      text:
        score >= 72
          ? "The judge found a clean line. Keep pressing this angle."
          : "The line landed, but the judge wants sharper evidence.",
      tone: "border-emerald-400/35 bg-emerald-400/10 text-emerald-100",
    },
    {
      label: "Rare angle",
      text:
        factCount >= 2
          ? "Multiple checkable claims detected. That gives the round more weight."
          : "One focused claim is on the table. Add one more concrete proof next turn.",
      tone: "border-sky-400/35 bg-sky-400/10 text-sky-100",
    },
    {
      label: "Volatility bonus",
      text:
        disputedCount > 0
          ? "Risky claim spotted. High upside if you can defend it, painful if you cannot."
          : "Low-risk argument. Stable, but not explosive yet.",
      tone: "border-amber-400/35 bg-amber-400/10 text-amber-100",
    },
    {
      label: "Pressure card",
      text:
        score >= 60
          ? "Debately has to answer this. Your next move can snowball it."
          : "Debately gets room to counter. Your next move needs a stronger hook.",
      tone: "border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-100",
    },
  ];
  return pool[seed % pool.length]!;
}

export function FactCheckCard({ variant, data }: Props) {
  const title =
    variant === "player" ? "JUDGE — your argument" : "JUDGE — Debately";
  const revealKey = [
    variant,
    Math.round(data.relevance),
    data.facts.length,
    data.flags.length,
    data.facts[0]?.claim ?? "",
  ].join(":");

  return <FactCheckReveal key={revealKey} title={title} data={data} />;
}

function FactCheckReveal({
  title,
  data,
}: Pick<Props, "data"> & { title: string }) {
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const score = Math.min(100, Math.max(0, Math.round(data.relevance)));
  const bonus = useMemo(() => buildBonusCopy(data), [data]);
  const firstClaim = data.facts[0]?.claim?.trim() ?? "";
  const shortClaim =
    firstClaim.length > 96 ? `${firstClaim.slice(0, 93)}...` : firstClaim;
  const preview =
    data.facts.length === 0
      ? "No concrete factual claims detected."
      : data.facts.length === 1
        ? shortClaim
        : `${shortClaim} (+${data.facts.length - 1} more)`;

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 1150);
    return () => window.clearTimeout(timer);
  }, []);

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
            <span>{revealed ? "Score" : "Score wheel"}</span>
            <span className="font-mono text-zinc-200">
              {revealed ? `${score}/100` : "??/100"}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full ${
                revealed
                  ? "bg-amber-500/70"
                  : "animate-pulse bg-gradient-to-r from-amber-400 via-fuchsia-400 to-sky-300"
              }`}
              style={{ width: revealed ? `${score}%` : "100%" }}
            />
          </div>
        </div>
        {!revealed ? (
          <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden>
            {["Evidence", "Logic", "Impact"].map((label) => (
              <div
                key={label}
                className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-center"
              >
                <span className="block animate-pulse text-[10px] font-black uppercase tracking-wide text-amber-200">
                  {label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={`mt-3 rounded-xl border p-3 ${bonus.tone}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.18em]">
              {bonus.label}
            </p>
            <p className="mt-1 text-xs leading-relaxed">{bonus.text}</p>
          </div>
        )}
        <button
          type="button"
          disabled={!revealed}
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 cursor-pointer rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100 disabled:cursor-wait disabled:opacity-50"
        >
          {!revealed ? "Rolling..." : expanded ? "Hide review" : "Show review"}
        </button>
        {revealed && expanded && (
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
