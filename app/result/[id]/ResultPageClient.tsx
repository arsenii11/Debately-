"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { verdictInForAgainstOrder } from "@/lib/multiplayer/verdictPerspective";
import type { PublicSession } from "@/lib/multiplayer/types";
import type { Verdict } from "@/lib/types";

const rows: { key: keyof Verdict["breakdown"]; label: string; weight: string }[] = [
  { key: "factual", label: "Factual accuracy", weight: "40%" },
  { key: "logic", label: "Logical consistency", weight: "25%" },
  { key: "relevance", label: "Relevance", weight: "20%" },
  { key: "rhetoric", label: "Rhetoric quality", weight: "15%" },
];

function ScoreBar({ p, o }: { p: number; o: number }) {
  const max = Math.max(p, o, 1);
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-zinc-800 print:bg-zinc-200">
      <div className="h-full bg-indigo-500" style={{ width: `${(p / max) * 50}%` }} />
      <div className="h-full bg-pink-500" style={{ width: `${(o / max) * 50}%` }} />
    </div>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="inline-block h-5 w-5 text-amber-400" aria-hidden>
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm2.1-1.5h9.8l.7-3.5-2.8 1.9L12 9.5 8.2 13.9 5.4 12l.7 3.5z" />
    </svg>
  );
}

export function ResultPageClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/multiplayer/sessions/${sessionId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((data: PublicSession) => setSession(data))
      .catch(() => setError("Debate result not found or has expired."));
  }, [sessionId]);

  const handlePrint = () => window.print();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-5 text-zinc-300">
        <div className="text-center">
          <p className="text-base font-semibold text-rose-300">{error}</p>
          <Link href="/" className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to Debately
          </Link>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-500">
        Loading result…
      </main>
    );
  }

  if (!session.verdict) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-5 text-zinc-300">
        <div className="text-center">
          <p className="text-base font-semibold">
            {session.state === "finished"
              ? "Verdict is being prepared. Check back in a moment."
              : "This debate is still in progress."}
          </p>
          <Link href={`/play/${sessionId}`} className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">
            Go to debate →
          </Link>
        </div>
      </main>
    );
  }

  const forPlayer = session.players.find((p) => p.side === "FOR");
  const againstPlayer = session.players.find((p) => p.side === "AGAINST");
  const forNick = forPlayer?.nickname ?? "FOR";
  const againstNick = againstPlayer?.nickname ?? "AGAINST";

  const verdict = verdictInForAgainstOrder(session.verdict, session);

  const winner =
    verdict.score_player === verdict.score_opponent
      ? null
      : verdict.score_player > verdict.score_opponent
        ? "player"
        : "opponent";
  const winnerNick = winner === "player" ? forNick : winner === "opponent" ? againstNick : null;

  const date = new Date(session.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      {/* Print-only & screen styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: #18181b !important; }
          .print-bg-white { background: white !important; }
          .print-border { border-color: #d4d4d8 !important; }
        }
      `}</style>

      <main className="min-h-dvh bg-zinc-950 px-4 py-10 text-zinc-300 print:bg-white print:text-zinc-900">
        <div className="mx-auto max-w-2xl">

          {/* Top nav — hidden when printing */}
          <div className="no-print mb-8 flex items-center justify-between gap-3">
            <Link href="/" className="text-sm text-zinc-500 transition-colors hover:text-zinc-300">
              ← Debately
            </Link>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                {copied ? "Copied!" : "Share link"}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="cursor-pointer rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:border-indigo-400 hover:bg-indigo-500/20"
              >
                Save as PDF
              </button>
            </div>
          </div>

          {/* Header */}
          <div className="mb-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-500 print:text-zinc-400">
              Debately · Debate Result · {date}
            </p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400">
              ⚖ Final Verdict
            </p>
            {winnerNick ? (
              <p className="mt-2 text-lg font-bold text-amber-200">
                Winner — {winnerNick}
              </p>
            ) : (
              <p className="mt-2 text-lg font-semibold text-zinc-400">Draw — tied score</p>
            )}
          </div>

          {/* Topic */}
          <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-center print:border-zinc-300 print:bg-white">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Topic</p>
            <p className="mt-2 text-base font-semibold leading-snug text-zinc-100 print:text-zinc-900">
              {session.settings.topic}
            </p>
          </div>

          {/* Score cards */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            {[
              { nick: forNick, score: verdict.score_player, side: "FOR", isWinner: winner === "player", accent: "indigo" },
              { nick: againstNick, score: verdict.score_opponent, side: "AGAINST", isWinner: winner === "opponent", accent: "pink" },
            ].map(({ nick, score, side, isWinner, accent }) => (
              <div
                key={side}
                className={`rounded-2xl border p-5 text-center ${
                  isWinner
                    ? accent === "indigo"
                      ? "border-indigo-400/60 bg-indigo-950/30 print:border-indigo-400"
                      : "border-pink-400/60 bg-pink-950/30 print:border-pink-400"
                    : "border-zinc-800 bg-zinc-900/30 print:border-zinc-300"
                }`}
              >
                {isWinner ? <CrownIcon /> : <span className="inline-block h-5" />}
                <p className={`mt-1 text-5xl font-black tabular-nums ${
                  isWinner
                    ? accent === "indigo" ? "text-indigo-200 print:text-indigo-700" : "text-pink-200 print:text-pink-700"
                    : "text-zinc-500"
                }`}>
                  {score}
                </p>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {nick}
                </p>
                <p className={`mt-1 text-[10px] font-semibold uppercase ${
                  side === "FOR" ? "text-emerald-400" : "text-rose-400"
                }`}>
                  {side}
                </p>
                {isWinner && (
                  <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    accent === "indigo"
                      ? "bg-indigo-500/20 text-indigo-200 print:bg-indigo-100 print:text-indigo-700"
                      : "bg-pink-500/20 text-pink-200 print:bg-pink-100 print:text-pink-700"
                  }`}>
                    Winner
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Breakdown */}
          <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Score breakdown</p>
            <div className="space-y-4">
              {rows.map(({ key, label, weight }) => {
                const [p, o] = verdict.breakdown[key];
                return (
                  <div key={key}>
                    <div className="mb-1.5 flex justify-between text-xs text-zinc-500">
                      <span>{label} <span className="text-zinc-600">({weight})</span></span>
                      <span className="font-mono text-zinc-300 print:text-zinc-700">
                        {forNick}: {p} · {againstNick}: {o}
                      </span>
                    </div>
                    <ScoreBar p={p} o={o} />
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-4 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-full bg-indigo-500" />{forNick} (FOR)</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded-full bg-pink-500" />{againstNick} (AGAINST)</span>
            </div>
          </div>

          {/* Summary */}
          <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Judge summary</p>
            <p className="text-sm leading-relaxed text-zinc-300 print:text-zinc-700">{verdict.summary}</p>
          </div>

          {/* Best args */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4 print:border-indigo-300 print:bg-white">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-indigo-400 print:text-indigo-700">
                ★ Best arg — {forNick}
              </p>
              <p className="text-xs leading-relaxed text-zinc-400 print:text-zinc-700">{verdict.best_arg_player}</p>
            </div>
            <div className="rounded-xl border border-pink-500/20 bg-pink-950/20 p-4 print:border-pink-300 print:bg-white">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-pink-400 print:text-pink-700">
                ★ Best arg — {againstNick}
              </p>
              <p className="text-xs leading-relaxed text-zinc-400 print:text-zinc-700">{verdict.best_arg_opponent}</p>
            </div>
          </div>

          {/* Transcript */}
          <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 print:border-zinc-300 print:bg-white">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Transcript</p>
            <div className="space-y-5">
              {session.history.map((r) => (
                <div key={r.round}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                    Round {r.round}
                  </p>
                  {r.forMove ? (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold text-emerald-400">{forNick} (FOR)</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-400 print:text-zinc-700">{r.forMove}</p>
                    </div>
                  ) : null}
                  {r.againstMove ? (
                    <div>
                      <p className="text-[10px] font-semibold text-rose-400">{againstNick} (AGAINST)</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-400 print:text-zinc-700">{r.againstMove}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-[10px] text-zinc-600">
            <p>Generated by Debately · debately.website · Result stored for 30 days</p>
            <p className="mt-1">Session ID: {sessionId}</p>
          </div>

          {/* Bottom nav — hidden when printing */}
          <div className="no-print mt-8 flex justify-center gap-3">
            <Link href={`/play/${sessionId}`} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white">
              Back to debate
            </Link>
            <Link href="/" className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 hover:border-indigo-400 hover:bg-indigo-500/20">
              New debate →
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
