"use client";

import { useEffect, useState } from "react";

type ParticleAnim = "rocket" | "zigzag" | "orbit" | "spin3d" | "ambient" | "sway";

type Particle = {
  emoji: string;
  top: string;
  left: string;
  size: string;
  dur: string;
  delay: string;
  anim: ParticleAnim;
  /** Higher outer opacity + purple glow. Use for particles away from the form. */
  bright: boolean;
  /** Hidden on mobile (<640px), visible on sm+ */
  desktopOnly: boolean;
};

const PARTICLES: Particle[] = [
  // ── always visible (mobile + desktop) ───────────────────────────
  // top corners — bright
  { emoji: "🚀", top:  "3%", left: "80%", size: "2.1rem",  dur: "10s", delay:  "0s",  anim: "rocket",  bright: true,  desktopOnly: false },
  { emoji: "⚖️", top:  "4%", left: "10%", size: "1.9rem",  dur:  "9s", delay: "1.5s", anim: "spin3d",  bright: true,  desktopOnly: false },
  { emoji: "🏆", top:  "5%", left: "48%", size: "1.8rem",  dur: "12s", delay: "3.2s", anim: "sway",    bright: true,  desktopOnly: false },
  // bottom corners — bright
  { emoji: "🔥", top: "87%", left: "12%", size: "1.8rem",  dur:  "8s", delay: "2.1s", anim: "ambient", bright: true,  desktopOnly: false },
  { emoji: "🎤", top: "89%", left: "74%", size: "1.8rem",  dur: "11s", delay: "0.6s", anim: "sway",    bright: true,  desktopOnly: false },
  { emoji: "✨", top: "84%", left: "46%", size: "1.5rem",  dur:  "7s", delay: "4.2s", anim: "sway",    bright: true,  desktopOnly: false },
  // mid sides — dim
  { emoji: "💬", top: "36%", left:  "4%", size: "1.5rem",  dur:  "9s", delay: "4s",   anim: "orbit",   bright: false, desktopOnly: false },
  { emoji: "⚡", top: "54%", left: "92%", size: "1.4rem",  dur:  "7s", delay: "2.6s", anim: "ambient", bright: false, desktopOnly: false },
  { emoji: "💡", top: "68%", left:  "6%", size: "1.5rem",  dur: "11s", delay: "1.1s", anim: "ambient", bright: false, desktopOnly: false },
  { emoji: "📣", top: "21%", left: "90%", size: "1.5rem",  dur: "10s", delay: "0.9s", anim: "orbit",   bright: false, desktopOnly: false },

  // ── desktop only ─────────────────────────────────────────────────
  // extreme left edge — some bright (far from form)
  { emoji: "🚀", top: "44%", left:  "1%", size: "1.7rem",  dur: "13s", delay: "6.5s", anim: "zigzag",  bright: true,  desktopOnly: true  },
  { emoji: "🔥", top: "20%", left:  "3%", size: "1.5rem",  dur:  "9s", delay: "2.8s", anim: "zigzag",  bright: false, desktopOnly: true  },
  { emoji: "⚡", top: "62%", left:  "2%", size: "1.3rem",  dur:  "8s", delay: "5.2s", anim: "sway",    bright: false, desktopOnly: true  },
  { emoji: "⚖️", top: "75%", left:  "1%", size: "1.5rem",  dur: "12s", delay: "3.1s", anim: "orbit",   bright: false, desktopOnly: true  },
  { emoji: "🎤", top: "32%", left:  "1%", size: "1.4rem",  dur: "10s", delay: "7.5s", anim: "ambient", bright: false, desktopOnly: true  },
  // extreme right edge — some bright
  { emoji: "🎯", top: "14%", left: "96%", size: "1.6rem",  dur: "11s", delay: "1.3s", anim: "rocket",  bright: true,  desktopOnly: true  },
  { emoji: "🌍", top: "30%", left: "96%", size: "1.7rem",  dur: "10s", delay: "0.4s", anim: "spin3d",  bright: true,  desktopOnly: true  },
  { emoji: "💬", top: "56%", left: "96%", size: "1.4rem",  dur:  "9s", delay: "4.8s", anim: "ambient", bright: false, desktopOnly: true  },
  { emoji: "🎤", top: "71%", left: "96%", size: "1.5rem",  dur: "11s", delay: "7.2s", anim: "orbit",   bright: false, desktopOnly: true  },
  { emoji: "⚡", top: "80%", left: "95%", size: "1.4rem",  dur:  "7s", delay: "2.2s", anim: "sway",    bright: true,  desktopOnly: true  },
  // extras scattered
  { emoji: "✨", top: "10%", left: "68%", size: "1.2rem",  dur:  "6s", delay: "3.9s", anim: "sway",    bright: false, desktopOnly: true  },
  { emoji: "✨", top: "50%", left:  "2%", size: "1.1rem",  dur:  "7s", delay: "5.1s", anim: "ambient", bright: false, desktopOnly: true  },
  { emoji: "📣", top: "94%", left: "33%", size: "1.6rem",  dur:  "8s", delay: "1.6s", anim: "sway",    bright: true,  desktopOnly: true  },
  { emoji: "🏆", top: "92%", left: "60%", size: "1.5rem",  dur: "10s", delay: "4.7s", anim: "ambient", bright: true,  desktopOnly: true  },
  { emoji: "💡", top:  "8%", left: "29%", size: "1.3rem",  dur:  "8s", delay: "3.6s", anim: "sway",    bright: false, desktopOnly: true  },
];
import {
  MIN_TURN_ROUNDS,
  MAX_TURN_ROUNDS,
  MIN_TURN_TIMER_SECONDS,
  MAX_TURN_TIMER_SECONDS,
  type Side,
  type TurnRounds,
  type TurnTimerSeconds,
} from "@/lib/types";

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  nickname: string;
  topic: string;
  side: Side;
  turnRounds: TurnRounds;
  turnTimerSeconds: TurnTimerSeconds;
  onNickname: (v: string) => void;
  onTopic: (v: string) => void;
  onSide: (s: Side) => void;
  onTurnRounds: (v: TurnRounds) => void;
  onTurnTimerSeconds: (s: TurnTimerSeconds) => void;
  onStart: () => void;
};

export function SetupScreen({
  nickname,
  topic,
  side,
  turnRounds,
  turnTimerSeconds,
  onNickname,
  onTopic,
  onSide,
  onTurnRounds,
  onTurnTimerSeconds,
  onStart,
}: Props) {
  const canStart = nickname.trim().length > 0 && topic.trim().length > 0;
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingTopics(true);
    fetch("/api/ai/topics")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        if (
          data &&
          typeof data === "object" &&
          "topics" in data &&
          Array.isArray((data as { topics: unknown }).topics)
        ) {
          const topics = (data as { topics: string[] }).topics.filter(
            (t): t is string => typeof t === "string" && t.trim().length > 0,
          );
          if (topics.length > 0) setSuggestions(topics);
        }
      })
      .catch(() => {
        /* silently skip */
      })
      .finally(() => {
        if (!cancelled) setLoadingTopics(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-col gap-8 px-4 py-12">
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className={p.desktopOnly ? "hidden sm:block" : undefined}
          style={{
            position: "fixed",
            top: p.top,
            left: p.left,
            opacity: p.bright ? 0.88 : 0.4,
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 0,
          }}
          aria-hidden
        >
          <span
            className={`setup-p setup-p-${p.anim}${p.bright ? " setup-p-glow" : ""}`}
            style={{
              display: "block",
              fontSize: p.size,
              "--pd": p.dur,
              "--pdd": p.delay,
            } as React.CSSProperties}
          >
            {p.emoji}
          </span>
        </div>
      ))}
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
          Debately
        </h1>
        <p className="mt-1 text-sm font-medium uppercase tracking-widest text-fuchsia-400/90">
          Solo — MVP
        </p>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Pick a topic, choose a side, and debate Debately. A neutral Judge
          factchecks each move and scores the match.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Nickname
        </label>
        <input
          type="text"
          maxLength={20}
          value={nickname}
          onChange={(e) => onNickname(e.target.value)}
          placeholder="e.g. Alex"
          className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-right text-xs text-zinc-600">
          {nickname.length}/20
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Topic (as a statement)
        </label>
        <textarea
          maxLength={200}
          rows={3}
          value={topic}
          onChange={(e) => onTopic(e.target.value)}
          placeholder='e.g. "Nuclear energy is essential for climate goals"'
          className="resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-base leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-right text-xs text-zinc-600">
          {topic.length}/200
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Debate rounds
          </span>
          <span className="text-sm font-semibold text-indigo-300">
            {turnRounds} rounds
          </span>
        </div>
        <input
          type="range"
          min={MIN_TURN_ROUNDS}
          max={MAX_TURN_ROUNDS}
          step={1}
          value={turnRounds}
          onChange={(e) => onTurnRounds(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-indigo-500"
        />
        <div className="flex justify-between text-xs text-zinc-600">
          <span>{MIN_TURN_ROUNDS}</span>
          <span>{MAX_TURN_ROUNDS}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Time per answer
          </span>
          <span className="text-sm font-semibold text-indigo-300">
            {formatTimer(turnTimerSeconds)}
          </span>
        </div>
        <input
          type="range"
          min={MIN_TURN_TIMER_SECONDS}
          max={MAX_TURN_TIMER_SECONDS}
          step={30}
          value={turnTimerSeconds}
          onChange={(e) => onTurnTimerSeconds(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-indigo-500"
        />
        <div className="flex justify-between text-xs text-zinc-600">
          <span>{formatTimer(MIN_TURN_TIMER_SECONDS)}</span>
          <span>{formatTimer(MAX_TURN_TIMER_SECONDS)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Your side
        </span>
        <div className="grid grid-cols-2 gap-3">
          {(["FOR", "AGAINST"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSide(s)}
              className={`cursor-pointer rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                s === "FOR"
                  ? side === s
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-100 shadow-md shadow-emerald-900/30"
                    : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-emerald-500/45 hover:bg-emerald-950/25 hover:text-emerald-100/95"
                  : side === s
                    ? "border-rose-500 bg-rose-500/20 text-rose-100 shadow-md shadow-rose-900/30"
                    : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-rose-500/45 hover:bg-rose-950/25 hover:text-rose-100/95"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Suggested topics
          {loadingTopics && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-indigo-400" />
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTopic(t)}
              className="cursor-pointer rounded-full border border-zinc-700 bg-zinc-900/40 px-3 py-1.5 text-left text-xs text-zinc-300 transition-all hover:border-indigo-500/40 hover:bg-zinc-800/80 hover:text-zinc-100 active:scale-[0.98]"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!canStart}
        onClick={onStart}
        className="cursor-pointer rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition-all hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-600/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none disabled:hover:scale-100"
      >
        Start Debate — {turnRounds} rounds
      </button>
    </div>
  );
}
