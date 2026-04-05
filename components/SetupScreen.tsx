"use client";

import type { Side } from "@/lib/types";

const TOPIC_SUGGESTIONS = [
  "EU sanctions against Russia are effective",
  "Universal basic income would reduce poverty",
  "AI will replace most white-collar jobs by 2035",
  "Nuclear energy is essential for climate goals",
  "Social media does more harm than good to democracy",
  "Cryptocurrency should be regulated like traditional banking",
  "Remote work permanently hurts team innovation",
  "Public universities should be tuition-free",
];

type Props = {
  nickname: string;
  topic: string;
  side: Side;
  onNickname: (v: string) => void;
  onTopic: (v: string) => void;
  onSide: (s: Side) => void;
  onStart: () => void;
};

export function SetupScreen({
  nickname,
  topic,
  side,
  onNickname,
  onTopic,
  onSide,
  onStart,
}: Props) {
  const canStart = nickname.trim().length > 0 && topic.trim().length > 0;

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
          Pick a topic, choose a side, and debate an AI opponent. A neutral
          Judge factchecks each move and scores the match.
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
                side === s
                  ? "border-indigo-500 bg-indigo-500/20 text-indigo-200 shadow-md shadow-indigo-900/20"
                  : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-indigo-500/50 hover:bg-zinc-800/70 hover:text-zinc-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Suggested topics
        </p>
        <div className="flex flex-wrap gap-2">
          {TOPIC_SUGGESTIONS.map((t) => (
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
        Start Debate — 3 rounds
      </button>
    </div>
  );
}
