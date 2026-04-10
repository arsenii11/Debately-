"use client";

import { useEffect, useState } from "react";
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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-4 py-12">
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
