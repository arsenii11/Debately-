"use client";

import type { Verdict } from "@/lib/types";

type Props = {
  verdict: Verdict;
  playerName: string;
  onNewDebate: () => void;
};

const rows: { key: keyof Verdict["breakdown"]; label: string; weight: string }[] =
  [
    { key: "factual", label: "Factual", weight: "40%" },
    { key: "logic", label: "Logic", weight: "25%" },
    { key: "relevance", label: "Relevance", weight: "20%" },
    { key: "rhetoric", label: "Rhetoric", weight: "15%" },
  ];

export function VerdictCard({ verdict, playerName, onNewDebate }: Props) {
  const winner =
    verdict.score_player === verdict.score_opponent
      ? null
      : verdict.score_player > verdict.score_opponent
        ? "player"
        : "opponent";

  return (
    <div className="mx-auto w-full max-w-[460px] px-2">
      <div className="rounded-2xl border-2 border-amber-400/40 bg-zinc-950/80 p-6 shadow-xl shadow-amber-900/10">
        <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-amber-400">
          ⚖ Final verdict
        </p>

        <div className="mt-6 flex items-start justify-center gap-10">
          <div className="text-center">
            <p
              className={`text-4xl font-bold tabular-nums text-zinc-100 ${
                winner === "player" ? "scale-110 text-indigo-300" : ""
              }`}
            >
              {verdict.score_player}
            </p>
            <p className="mt-1 text-xs font-medium text-zinc-500">
              {playerName}
            </p>
            {winner === "player" && (
              <span className="mt-2 inline-block rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-300">
                Winner
              </span>
            )}
          </div>
          <div className="text-center">
            <p
              className={`text-4xl font-bold tabular-nums text-zinc-100 ${
                winner === "opponent" ? "scale-110 text-pink-300" : ""
              }`}
            >
              {verdict.score_opponent}
            </p>
            <p className="mt-1 text-xs font-medium text-zinc-500">
              Opponent
            </p>
            {winner === "opponent" && (
              <span className="mt-2 inline-block rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pink-300">
                Winner
              </span>
            )}
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {rows.map(({ key, label, weight }) => {
            const [p, o] = verdict.breakdown[key];
            const max = Math.max(p, o, 1);
            return (
              <div key={key}>
                <div className="mb-1 flex justify-between text-xs text-zinc-500">
                  <span>
                    {label}{" "}
                    <span className="text-zinc-600">({weight})</span>
                  </span>
                  <span className="font-mono text-zinc-400">
                    {p} — {o}
                  </span>
                </div>
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-indigo-500/80"
                    style={{ width: `${(p / max) * 50}%` }}
                  />
                  <div
                    className="h-full bg-pink-500/80"
                    style={{ width: `${(o / max) * 50}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 border-t border-zinc-800 pt-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            Summary
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            {verdict.summary}
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-400">
              ★ Best arg — {playerName}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {verdict.best_arg_player}
            </p>
          </div>
          <div className="rounded-xl border border-pink-500/20 bg-pink-950/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-pink-400">
              ★ Best arg — Opponent
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {verdict.best_arg_opponent}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewDebate}
          className="mt-8 w-full cursor-pointer rounded-xl border border-zinc-600 py-3 text-sm font-semibold text-zinc-200 transition-all hover:border-zinc-500 hover:bg-zinc-800/60 hover:text-white active:scale-[0.99]"
        >
          New Debate
        </button>
      </div>
    </div>
  );
}
