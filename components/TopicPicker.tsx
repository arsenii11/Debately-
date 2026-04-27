"use client";

import { useCallback, useEffect, useState } from "react";
import type { TopicCategory } from "@/app/api/ai/topics/route";

const CACHE_KEY = "debately-topics-v1";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dedupeTopics(topics: string[]): string[] {
  return Array.from(
    new Set(topics.map((t) => t.trim()).filter((t) => t.length > 0)),
  );
}

const CATEGORY_COLORS: Record<string, { active: string; idle: string }> = {
  easy: {
    active:
      "bg-emerald-400/25 text-emerald-50 ring-1 ring-emerald-300/50 shadow-sm shadow-emerald-900/30",
    idle: "bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20 hover:text-emerald-50",
  },
  fun: {
    active:
      "bg-amber-400/25 text-amber-50 ring-1 ring-amber-300/50 shadow-sm shadow-amber-900/30",
    idle: "bg-amber-400/10 text-amber-200 hover:bg-amber-400/20 hover:text-amber-50",
  },
  life: {
    active:
      "bg-rose-400/25 text-rose-50 ring-1 ring-rose-300/50 shadow-sm shadow-rose-900/30",
    idle: "bg-rose-400/10 text-rose-200 hover:bg-rose-400/20 hover:text-rose-50",
  },
  tech: {
    active:
      "bg-sky-400/25 text-sky-50 ring-1 ring-sky-300/50 shadow-sm shadow-sky-900/30",
    idle: "bg-sky-400/10 text-sky-200 hover:bg-sky-400/20 hover:text-sky-50",
  },
  politics: {
    active:
      "bg-violet-400/25 text-violet-50 ring-1 ring-violet-300/50 shadow-sm shadow-violet-900/30",
    idle: "bg-violet-400/10 text-violet-200 hover:bg-violet-400/20 hover:text-violet-50",
  },
};

const CATEGORY_FALLBACK_COLOR = {
  active:
    "bg-zinc-200/20 text-zinc-50 ring-1 ring-zinc-300/40 shadow-sm shadow-zinc-900/30",
  idle: "bg-zinc-400/10 text-zinc-300 hover:bg-zinc-400/20 hover:text-zinc-50",
};

function getCategoryColor(id: string) {
  return CATEGORY_COLORS[id] ?? CATEGORY_FALLBACK_COLOR;
}

function parseCategories(data: unknown): TopicCategory[] | null {
  if (
    data &&
    typeof data === "object" &&
    "categories" in data &&
    Array.isArray((data as { categories: unknown }).categories)
  ) {
    const cats = (data as { categories: TopicCategory[] }).categories.filter(
      (c) =>
        c &&
        typeof c.id === "string" &&
        typeof c.label === "string" &&
        Array.isArray(c.topics) &&
        c.topics.length > 0,
    );
    return cats.length > 0 ? cats : null;
  }
  return null;
}

type Props = {
  selectedTopic: string;
  onTopic: (topic: string) => void;
};

export function TopicPicker({ selectedTopic, onTopic }: Props) {
  const [topicCategories, setTopicCategories] = useState<TopicCategory[] | null>(null);
  const [activeTopicGroup, setActiveTopicGroup] = useState<string>("easy");
  const [loadingTopics, setLoadingTopics] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let hadCache = false;
    const today = todayStr();

    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as { date: string; categories: TopicCategory[] };
        if (stored.date === today && Array.isArray(stored.categories)) {
          const cats = parseCategories({ categories: stored.categories });
          if (cats) {
            setTopicCategories(cats);
            setActiveTopicGroup(cats[0].id);
            setLoadingTopics(false);
            hadCache = true;
          }
        }
      }
    } catch {
      /* corrupt cache — ignore */
    }

    if (!hadCache) setLoadingTopics(true);

    fetch("/api/ai/topics")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const cats = parseCategories(data);
        if (cats) {
          setTopicCategories(cats);
          setActiveTopicGroup((prev) => prev ?? cats[0].id);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, categories: cats }));
          } catch {
            /* storage full — ignore */
          }
        }
      })
      .catch(() => { /* silently skip */ })
      .finally(() => {
        if (!cancelled) setLoadingTopics(false);
      });

    return () => { cancelled = true; };
  }, []);

  const activeStarterTopics =
    (topicCategories ?? []).find((g) => g.id === activeTopicGroup)?.topics ??
    (topicCategories ?? [])[0]?.topics ??
    [];

  const topicOfTheDay =
    (topicCategories ?? [])[0]?.topics?.[0] ?? activeStarterTopics[0] ?? "";

  const newTopicsToday = Math.min(
    3,
    dedupeTopics((topicCategories ?? []).flatMap((g) => g.topics)).length,
  );

  const handleRandom = useCallback(() => {
    const all = dedupeTopics((topicCategories ?? []).flatMap((g) => g.topics));
    if (all.length === 0) return;
    const pick = all[Math.floor(Math.random() * all.length)];
    if (pick) onTopic(pick);
  }, [topicCategories, onTopic]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-base font-semibold text-zinc-100 sm:text-lg">
            Pick a topic
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            {loadingTopics ? (
              "Loading topics…"
            ) : (
              <>
                Today&apos;s set includes{" "}
                <span className="font-medium tabular-nums text-zinc-400">
                  {newTopicsToday}
                </span>{" "}
                {newTopicsToday === 1 ? "fresh topic" : "fresh topics"}.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRandom}
          disabled={loadingTopics || !topicCategories}
          className="touch-manipulation sm:self-end min-h-11 w-full shrink-0 cursor-pointer rounded-xl border-2 border-indigo-500/55 bg-indigo-600/20 px-4 py-2.5 text-center text-sm font-semibold text-indigo-100 shadow-sm shadow-indigo-950/20 transition-colors hover:border-indigo-400 hover:bg-indigo-500/30 hover:text-white active:scale-[0.99] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900/50 disabled:text-zinc-600 disabled:shadow-none disabled:hover:scale-100 sm:w-auto sm:min-w-[10.5rem]"
        >
          Random topic
        </button>
      </div>

      {loadingTopics ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2.5">
            {[88, 72, 80, 64, 96].map((w) => (
              <span
                key={w}
                className="h-10 animate-pulse rounded-full bg-zinc-800 sm:h-11"
                style={{ width: `${w}px` }}
              />
            ))}
          </div>
          <div className="grid gap-2 min-[420px]:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className="h-[52px] animate-pulse rounded-2xl bg-zinc-800/70"
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          {topicOfTheDay ? (
            <button
              type="button"
              onClick={() => onTopic(topicOfTheDay)}
              className={`cursor-pointer rounded-xl border p-4 text-left transition-all active:scale-[0.99] ${
                selectedTopic.trim() === topicOfTheDay
                  ? "border-zinc-500 bg-zinc-800/70"
                  : "border-zinc-700 bg-zinc-950/45 hover:border-zinc-500 hover:bg-zinc-900/70"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
                  Topic of the Day
                </span>
              </div>
              <p className="mt-3 text-base font-medium leading-snug text-zinc-100">
                {topicOfTheDay}
              </p>
            </button>
          ) : null}

          <div className="flex flex-wrap gap-2.5">
            {(topicCategories ?? []).map((group) => {
              const colors = getCategoryColor(group.id);
              const active = group.id === activeTopicGroup;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveTopicGroup(group.id)}
                  className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold backdrop-blur-sm transition-all active:scale-[0.97] sm:px-5 sm:py-2.5 sm:text-base ${
                    active ? colors.active : colors.idle
                  }`}
                >
                  {group.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-2 min-[420px]:grid-cols-2">
            {activeStarterTopics.map((starterTopic) => {
              const selected = selectedTopic.trim() === starterTopic;
              return (
                <button
                  key={starterTopic}
                  type="button"
                  onClick={() => onTopic(starterTopic)}
                  className={`cursor-pointer rounded-2xl border px-4 py-3 text-left text-sm leading-relaxed transition-all active:scale-[0.99] ${
                    selected
                      ? "border-indigo-500 bg-indigo-500/15 text-zinc-50 shadow-md shadow-indigo-950/30"
                      : "border-zinc-700 bg-zinc-950/60 text-zinc-200 hover:border-indigo-500/45 hover:bg-zinc-900 hover:text-white"
                  }`}
                >
                  {starterTopic}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
