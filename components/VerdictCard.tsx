"use client";

import { useState } from "react";
import type { Verdict } from "@/lib/types";

type Props = {
  verdict: Verdict;
  playerName: string;
  opponentName?: string;
  onNewDebate: () => void;
  newDebateLabel?: string;
  resultUrl?: string;
};

const rows: { key: keyof Verdict["breakdown"]; label: string; weight: string }[] =
  [
    { key: "factual", label: "Factual", weight: "40%" },
    { key: "logic", label: "Logic", weight: "25%" },
    { key: "relevance", label: "Relevance", weight: "20%" },
    { key: "rhetoric", label: "Rhetoric", weight: "15%" },
  ];

const insightLabels: Record<keyof Verdict["breakdown"], string> = {
  factual: "Evidence",
  logic: "Logic",
  relevance: "Relevance",
  rhetoric: "Rhetoric",
};

function buildPlayerInsight(verdict: Verdict): string {
  const scores = rows.map(({ key }) => ({
    key,
    score: verdict.breakdown[key][0],
  }));
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  const weakest = scores.reduce((a, b) => (b.score < a.score ? b : a));
  if (best.key === weakest.key) {
    return `Your debate profile is balanced today. Try adding one sharper example next time.`;
  }
  return `Your best dimension today: ${insightLabels[best.key]}. Try focusing on ${insightLabels[weakest.key]} next time.`;
}

function buildComebackOutro(verdict: Verdict): {
  title: string;
  hint: string;
} {
  const deficits = rows
    .map(({ key }) => ({
      key,
      delta: verdict.breakdown[key][1] - verdict.breakdown[key][0],
    }))
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  if (deficits.length === 0) {
    return {
      title: "That was razor-close.",
      hint: "One sharper example in your next round can swing the verdict.",
    };
  }

  const primary = insightLabels[deficits[0].key];
  const secondary = deficits[1] ? insightLabels[deficits[1].key] : null;
  return {
    title: "You almost had it.",
    hint: secondary
      ? `Push ${primary} and ${secondary} a bit harder next round — you can absolutely take it.`
      : `Push ${primary} a bit harder next round — you can absolutely take it.`,
  };
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm2.1-1.5h9.8l.7-3.5-2.8 1.9L12 9.5 8.2 13.9 5.4 12l.7 3.5z" />
    </svg>
  );
}

export function VerdictCard({
  verdict,
  playerName,
  opponentName,
  onNewDebate,
  newDebateLabel,
  resultUrl,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = resultUrl ?? window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  const opponentLabel = opponentName ?? "Debately";
  const winner =
    verdict.score_player === verdict.score_opponent
      ? null
      : verdict.score_player > verdict.score_opponent
        ? "player"
        : "opponent";

  const winnerLabel =
    winner === "player"
      ? playerName
      : winner === "opponent"
        ? opponentLabel
        : null;
  const playerInsight = buildPlayerInsight(verdict);
  const comeback = buildComebackOutro(verdict);

  return (
    <div className="mx-auto w-full max-w-[460px] px-2">
      <div className="rounded-2xl border-2 border-amber-400/40 bg-zinc-950/80 p-6 shadow-xl shadow-amber-900/10">
        <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-amber-400">
          ⚖ Final verdict
        </p>

        {winnerLabel ? (
          <p className="mt-3 text-center text-sm font-bold text-amber-200/95">
            <span className="text-amber-400/80">Winner — </span>
            {winnerLabel}
          </p>
        ) : (
          <p className="mt-3 text-center text-sm font-semibold text-zinc-400">
            Draw — tied score
          </p>
        )}

        <div className="mt-6 flex items-stretch justify-center gap-4 sm:gap-8">
          <div
            className={`flex min-w-0 flex-1 max-w-[200px] flex-col items-center rounded-2xl px-3 py-4 text-center transition-all duration-300 sm:px-5 sm:py-5 ${
              winner === "player"
                ? "scale-[1.06] ring-2 ring-indigo-400/90 ring-offset-2 ring-offset-zinc-950 bg-indigo-500/10 shadow-[0_0_32px_rgba(129,140,248,0.22)]"
                : winner === "opponent"
                  ? "opacity-80"
                  : "ring-1 ring-zinc-700/60 bg-zinc-900/40"
            }`}
          >
            {winner === "player" ? (
              <CrownIcon className="mb-1 h-9 w-9 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)] sm:h-10 sm:w-10" />
            ) : (
              <span className="mb-1 h-9 sm:h-10" aria-hidden />
            )}
            <p
              className={`font-black tabular-nums leading-none tracking-tight ${
                winner === "player"
                  ? "text-5xl text-indigo-200 sm:text-6xl md:text-7xl"
                  : "text-3xl text-zinc-500 sm:text-4xl"
              }`}
            >
              {verdict.score_player}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {playerName}
            </p>
            {winner === "player" && (
              <span className="mt-2 inline-block rounded-full border border-indigo-400/50 bg-indigo-500/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-200">
                Winner
              </span>
            )}
          </div>

          <div
            className={`flex min-w-0 flex-1 max-w-[200px] flex-col items-center rounded-2xl px-3 py-4 text-center transition-all duration-300 sm:px-5 sm:py-5 ${
              winner === "opponent"
                ? "scale-[1.06] ring-2 ring-pink-400/90 ring-offset-2 ring-offset-zinc-950 bg-pink-500/10 shadow-[0_0_32px_rgba(244,114,182,0.22)]"
                : winner === "player"
                  ? "opacity-80"
                  : "ring-1 ring-zinc-700/60 bg-zinc-900/40"
            }`}
          >
            {winner === "opponent" ? (
              <CrownIcon className="mb-1 h-9 w-9 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)] sm:h-10 sm:w-10" />
            ) : (
              <span className="mb-1 h-9 sm:h-10" aria-hidden />
            )}
            <p
              className={`font-black tabular-nums leading-none tracking-tight ${
                winner === "opponent"
                  ? "text-5xl text-pink-200 sm:text-6xl md:text-7xl"
                  : "text-3xl text-zinc-500 sm:text-4xl"
              }`}
            >
              {verdict.score_opponent}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {opponentLabel}
            </p>
            {winner === "opponent" && (
              <span className="mt-2 inline-block rounded-full border border-pink-400/50 bg-pink-500/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-pink-200">
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

        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Next focus
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            {playerInsight}
          </p>
        </div>

        {winner === "opponent" ? (
          <div className="mt-4 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
              Comeback angle
            </p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-100">
              {comeback.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-200/90">
              {comeback.hint}
            </p>
          </div>
        ) : null}

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
              ★ Best arg — {opponentLabel}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {verdict.best_arg_opponent}
            </p>
          </div>
        </div>

        {resultUrl ? (
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleShare()}
              className="cursor-pointer rounded-xl border border-zinc-600 py-2.5 text-sm font-semibold text-zinc-200 transition-all hover:border-zinc-500 hover:bg-zinc-800/60 hover:text-white active:scale-[0.99]"
            >
              {copied ? "Copied!" : "Share result"}
            </button>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/10 py-2.5 text-sm font-semibold text-indigo-200 transition-all hover:border-indigo-400 hover:bg-indigo-500/20 active:scale-[0.99]"
            >
              Save as PDF
            </a>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onNewDebate}
          className="mt-3 w-full cursor-pointer rounded-xl border border-zinc-600 py-3 text-sm font-semibold text-zinc-200 transition-all hover:border-zinc-500 hover:bg-zinc-800/60 hover:text-white active:scale-[0.99]"
        >
          {newDebateLabel ?? "New Debate"}
        </button>
      </div>
    </div>
  );
}
