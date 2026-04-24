"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_TIMED_TURN_TIMER_SECONDS,
  UNTIMED_TURN_TIMER_SECONDS,
  MIN_TURN_ROUNDS,
  MAX_TURN_ROUNDS,
  MIN_TURN_TIMER_SECONDS,
  MAX_TURN_TIMER_SECONDS,
  type Side,
  type TurnRounds,
  type TurnTimerSeconds,
} from "@/lib/types";

type ParticleAnim =
  | "rocketBack"
  /** 🌙 center + 🚀 circular orbit */
  | "rocketMoon"
  /** 🌍 on ground + 🚀 launch loop */
  | "rocketEarth"
  /** Vertical-only float in side gutters — never drifts over max-w-lg column */
  | "gutter";

/** Flags, pairs, EU/Baltics, debate + people — cycled in UI so slots are not static */
const POOL_GEO = [
  "🇺🇸",
  "🇮🇷",
  "🇺🇸🇮🇷",
  "🇺🇦",
  "🇷🇺",
  "🇺🇦🇷🇺",
  "🇪🇺",
  "🇪🇪",
  "🇱🇻",
  "🇱🇹",
  "🇪🇪🇱🇻🇱🇹",
  "🇪🇺🇪🇪",
  "🇩🇪",
  "🇫🇷",
  "🇬🇧",
  "🇵🇱",
  "🇹🇷",
  "🇨🇳",
  "🇹🇼",
  "🇮🇱",
  "🇵🇸",
  "🇰🇵",
  "🇸🇦",
  "🇧🇾",
  "🇮🇳",
  "🇯🇵",
  "🛡️",
  "🌍",
  "🌐",
];

const POOL_PEOPLE = [
  "🤡",
  "🎭",
  "👥",
  "🧑‍🤝‍🧑",
  "🗣️",
  "🙋",
  "🙋‍♂️",
  "🙋‍♀️",
  "🧑‍⚖️",
  "👔",
  "🤵",
  "🥸",
  "😤",
  "🤼",
  "👯",
  "🧑‍💼",
  "🧑‍🎓",
  "👨‍💼",
  "👩‍💼",
  "🦸",
  "🧙",
  "🤠",
  "🧑‍🏫",
];

const FLEE_ON_CLICK = new Set(POOL_PEOPLE);

const POOL_DEBATE = [
  "💬",
  "📣",
  "⚖️",
  "🎤",
  "🏛️",
  "📜",
  "🗳️",
  "✅",
  "❌",
  "🤝",
  "📰",
  "🏆",
  "🔥",
  "✨",
  "💡",
  "⚡",
];

const POOL_MIX_A = [...POOL_GEO, ...POOL_PEOPLE];
const POOL_MIX_B = [...POOL_PEOPLE, ...POOL_DEBATE];
const POOL_MIX_C = [...POOL_GEO, ...POOL_DEBATE];
const POOL_CHAOS = [...POOL_GEO, ...POOL_PEOPLE, ...POOL_DEBATE];
const QUESTION_GLYPHS = ["?", "❓", "❔"] as const;
const GEO_GLYPH_SET = new Set(POOL_GEO);

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickDifferent(pool: readonly string[], current: string): string {
  if (pool.length <= 1) return pool[0] ?? current;
  let next = pickRandom(pool);
  for (let t = 0; t < 40 && next === current; t++) next = pickRandom(pool);
  if (next === current) {
    const i = pool.indexOf(current);
    return pool[(i + 1) % pool.length]!;
  }
  return next;
}

type Particle = {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  size: string;
  dur: string;
  delay: string;
  anim: ParticleAnim;
  bright: boolean;
  desktopOnly: boolean;
  emoji?: "🚀";
  pool?: readonly string[];
};

/** Distance presets from screen edges for a more spread-out layout */
const EDGE_NEAR = "clamp(8px, 1.8vw, 24px)";
const EDGE_MID = "clamp(1rem, 7vw, 6.2rem)";
const EDGE_WIDE = "clamp(1.75rem, 13vw, 13.5rem)";

type ParticleVariance = {
  xPx: number;
  yPx: number;
  rocketBackVariant: 1 | 2 | 3;
  earthVariant: 1 | 2 | 3;
  moonOrbitRem: number;
};

const NON_ROCKET_MIN_Y_GAP_PCT = 9;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomVariant(): ParticleVariance {
  return {
    xPx: randomInt(-44, 44),
    yPx: randomInt(-52, 52),
    rocketBackVariant: randomInt(1, 3) as 1 | 2 | 3,
    earthVariant: randomInt(1, 3) as 1 | 2 | 3,
    moonOrbitRem: randomInt(210, 290) / 100,
  };
}

function isFlyingRocketAnim(anim: ParticleAnim): boolean {
  return anim === "rocketBack" || anim === "rocketEarth" || anim === "rocketMoon";
}

function particleSide(p: Particle): "left" | "right" | "other" {
  if (p.left !== undefined) return "left";
  if (p.right !== undefined) return "right";
  return "other";
}

function parseTopPercent(top?: string): number | null {
  if (!top) return null;
  const m = top.match(/(-?\d+(?:\.\d+)?)%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function particleYPercent(p: Particle, v: ParticleVariance): number {
  const baseTop = parseTopPercent(p.top) ?? 50;
  return baseTop + v.yPx / 10;
}

function enforceNonRocketSpacing(vars: ParticleVariance[]): ParticleVariance[] {
  const out = vars.map((v) => ({ ...v }));
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < PARTICLES.length; i++) {
      const pi = PARTICLES[i];
      if (!pi || isFlyingRocketAnim(pi.anim)) continue;
      for (let j = i + 1; j < PARTICLES.length; j++) {
        const pj = PARTICLES[j];
        if (!pj || isFlyingRocketAnim(pj.anim)) continue;
        if (particleSide(pi) !== particleSide(pj)) continue;

        const yi = particleYPercent(pi, out[i]!);
        const yj = particleYPercent(pj, out[j]!);
        const gap = Math.abs(yi - yj);
        if (gap >= NON_ROCKET_MIN_Y_GAP_PCT) continue;

        const need = (NON_ROCKET_MIN_Y_GAP_PCT - gap) / 2;
        // ~10px vertical offset ≈ 1% viewport in setup layout.
        const shiftPx = Math.ceil(need * 10);
        if (yi <= yj) {
          out[i]!.yPx -= shiftPx;
          out[j]!.yPx += shiftPx;
        } else {
          out[i]!.yPx += shiftPx;
          out[j]!.yPx -= shiftPx;
        }
      }
    }
  }

  // Keep non-rocket offsets within a sane range.
  return out.map((v, i) =>
    isFlyingRocketAnim(PARTICLES[i]!.anim)
      ? v
      : {
          ...v,
          yPx: Math.max(-70, Math.min(70, v.yPx)),
          xPx: Math.max(-62, Math.min(62, v.xPx)),
        },
  );
}

function nextVariantIndex(curr: 1 | 2 | 3): 1 | 2 | 3 {
  const options: Array<1 | 2 | 3> = [1, 2, 3].filter(
    (v): v is 1 | 2 | 3 => v !== curr,
  );
  return pickRandom(options);
}

function isGeoCapableParticle(p: Particle): boolean {
  return Boolean(p.pool?.some((g) => GEO_GLYPH_SET.has(g)));
}

function pickSceneEmoji(p: Particle, current: string): string {
  if (p.emoji) return p.emoji;
  if (!p.pool) return "🚀";

  if (!isGeoCapableParticle(p)) {
    return pickDifferent(p.pool, current);
  }

  const isQuestionNow = QUESTION_GLYPHS.includes(current as (typeof QUESTION_GLYPHS)[number]);
  if (isQuestionNow) {
    // Question marks should morph back into a country symbol.
    return pickDifferent(POOL_GEO, "");
  }

  const isCountryNow = GEO_GLYPH_SET.has(current);
  const qChance = isCountryNow ? 0.34 : 0.16;
  if (Math.random() < qChance) {
    return pickRandom(QUESTION_GLYPHS);
  }

  return pickDifferent(p.pool, current);
}

function holdMsForEmoji(p: Particle, emoji: string): number {
  if (p.anim === "rocketMoon" || p.anim === "rocketEarth" || p.anim === "rocketBack") {
    return 60_000;
  }
  if (QUESTION_GLYPHS.includes(emoji as (typeof QUESTION_GLYPHS)[number])) {
    return randomInt(1200, 3600);
  }
  if (GEO_GLYPH_SET.has(emoji)) {
    return randomInt(3300, 9800);
  }
  return randomInt(2200, 7600);
}

const PARTICLES: Particle[] = [
  {
    anim: "rocketMoon",
    top: "9%",
    right: EDGE_WIDE,
    size: "2rem",
    dur: "16s",
    delay: "0s",
    bright: true,
    desktopOnly: false,
  },
  {
    anim: "rocketEarth",
    bottom: "5%",
    left: EDGE_WIDE,
    size: "1.12rem",
    dur: "18s",
    delay: "1.4s",
    bright: true,
    desktopOnly: false,
  },
  { pool: POOL_MIX_C, top: "6%", left: EDGE_MID, size: "1.9rem", dur: "10s", delay: "0.8s", anim: "gutter", bright: true, desktopOnly: false },
  { pool: POOL_MIX_B, top: "22%", right: EDGE_WIDE, size: "1.75rem", dur: "11s", delay: "2.4s", anim: "gutter", bright: true, desktopOnly: false },
  { pool: POOL_GEO, top: "38%", left: EDGE_NEAR, size: "1.65rem", dur: "9s", delay: "1.1s", anim: "gutter", bright: false, desktopOnly: false },
  { pool: POOL_PEOPLE, top: "52%", right: EDGE_MID, size: "1.7rem", dur: "12s", delay: "3s", anim: "gutter", bright: true, desktopOnly: false },
  { pool: POOL_DEBATE, top: "68%", left: EDGE_WIDE, size: "1.5rem", dur: "8s", delay: "4.3s", anim: "gutter", bright: false, desktopOnly: false },
  { pool: POOL_MIX_A, top: "82%", right: EDGE_NEAR, size: "1.55rem", dur: "10s", delay: "0.3s", anim: "gutter", bright: false, desktopOnly: false },
  { pool: POOL_CHAOS, top: "94%", left: EDGE_MID, size: "1.45rem", dur: "9s", delay: "2.9s", anim: "gutter", bright: true, desktopOnly: false },

  { pool: POOL_GEO, top: "12%", right: EDGE_NEAR, size: "1.5rem", dur: "9s", delay: "1.2s", anim: "gutter", bright: false, desktopOnly: true },
  { pool: POOL_PEOPLE, top: "26%", left: EDGE_WIDE, size: "1.35rem", dur: "10s", delay: "4.5s", anim: "gutter", bright: false, desktopOnly: true },
  { pool: POOL_DEBATE, top: "40%", right: EDGE_MID, size: "1.5rem", dur: "11s", delay: "0.6s", anim: "gutter", bright: false, desktopOnly: true },
  { pool: POOL_MIX_A, top: "54%", left: EDGE_NEAR, size: "1.4rem", dur: "8s", delay: "3.3s", anim: "gutter", bright: false, desktopOnly: true },
  {
    emoji: "🚀",
    top: "8%",
    right: "3%",
    size: "1.9rem",
    dur: "17s",
    delay: "2s",
    anim: "rocketBack",
    bright: true,
    desktopOnly: true,
  },
  { pool: POOL_MIX_C, top: "18%", left: EDGE_MID, size: "1.65rem", dur: "10s", delay: "2.1s", anim: "gutter", bright: true, desktopOnly: true },
  { pool: POOL_CHAOS, top: "32%", right: EDGE_NEAR, size: "1.4rem", dur: "9s", delay: "5s", anim: "gutter", bright: false, desktopOnly: true },
  { pool: POOL_MIX_B, top: "46%", left: EDGE_WIDE, size: "1.5rem", dur: "12s", delay: "1.7s", anim: "gutter", bright: false, desktopOnly: true },
  { pool: POOL_GEO, top: "60%", right: EDGE_WIDE, size: "1.45rem", dur: "7s", delay: "0.2s", anim: "gutter", bright: true, desktopOnly: true },
  { pool: POOL_PEOPLE, top: "72%", left: EDGE_MID, size: "1.3rem", dur: "9s", delay: "4.1s", anim: "gutter", bright: false, desktopOnly: true },
  { pool: POOL_DEBATE, top: "84%", right: EDGE_MID, size: "1.5rem", dur: "8s", delay: "2.8s", anim: "gutter", bright: true, desktopOnly: true },
  { pool: POOL_MIX_A, top: "92%", left: EDGE_NEAR, size: "1.55rem", dur: "11s", delay: "3.6s", anim: "gutter", bright: true, desktopOnly: true },
  { pool: POOL_CHAOS, top: "8%", left: EDGE_WIDE, size: "1.25rem", dur: "7s", delay: "5.5s", anim: "gutter", bright: false, desktopOnly: true },
  { pool: POOL_GEO, top: "96%", right: EDGE_NEAR, size: "1.4rem", dur: "10s", delay: "1.4s", anim: "gutter", bright: false, desktopOnly: true },
];

function initialParticleEmoji(p: Particle): string {
  if (p.emoji) return p.emoji;
  if (!p.pool) return "🚀";
  return pickRandom(p.pool);
}

type TapFx =
  | { k: "flee"; tx: number; ty: number }
  | { k: "rocket"; tx: number; ty: number }
  | { k: "hop"; tx: number; ty: number }
  | { k: "nudge" };

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, "0")}`;
}

import type { TopicCategory } from "@/app/api/ai/topics/route";

function dedupeTopics(topics: string[]): string[] {
  return Array.from(
    new Set(topics.map((topic) => topic.trim()).filter((topic) => topic.length > 0)),
  );
}

// Pastel color per category. Active = filled tinted bg + ring, inactive = soft tinted bg.
const CATEGORY_COLORS: Record<
  string,
  { active: string; idle: string }
> = {
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
  const [topicCategories, setTopicCategories] = useState<TopicCategory[] | null>(null);
  const [activeTopicGroup, setActiveTopicGroup] = useState<string>("easy");
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [particleEmojis, setParticleEmojis] = useState<string[]>(() =>
    PARTICLES.map(initialParticleEmoji),
  );
  const [tapFx, setTapFx] = useState<(TapFx | null)[]>(() =>
    PARTICLES.map(() => null),
  );
  const [particleVariance, setParticleVariance] = useState<ParticleVariance[]>(() =>
    enforceNonRocketSpacing(PARTICLES.map(() => randomVariant())),
  );
  const nextEmojiSwapAtRef = useRef<number[]>(
    PARTICLES.map(() => Date.now() + randomInt(900, 6500)),
  );
  const tapFxRef = useRef(tapFx);
  tapFxRef.current = tapFx;
  const timedModeEnabled = turnTimerSeconds > UNTIMED_TURN_TIMER_SECONDS;
  const activeStarterTopics =
    (topicCategories ?? []).find((g) => g.id === activeTopicGroup)?.topics ??
    (topicCategories ?? [])[0]?.topics ??
    [];

  const handleRandomTopic = useCallback(() => {
    const allTopics = dedupeTopics(
      (topicCategories ?? []).flatMap((g) => g.topics),
    );
    if (allTopics.length > 0) onTopic(pickRandom(allTopics));
  }, [onTopic, topicCategories]);

  const setTimedMode = useCallback(
    (enabled: boolean) => {
      onTurnTimerSeconds(
        enabled ? DEFAULT_TIMED_TURN_TIMER_SECONDS : UNTIMED_TURN_TIMER_SECONDS,
      );
    },
    [onTurnTimerSeconds],
  );

  const rerollSpawnAtIndex = useCallback((i: number) => {
    setParticleVariance((prev) =>
      prev.map((v, idx) => {
        if (idx !== i) return v;
        let nx = randomInt(-58, 58);
        let ny = randomInt(-64, 64);
        for (let t = 0; t < 8; t++) {
          if (Math.abs(nx - v.xPx) + Math.abs(ny - v.yPx) > 28) break;
          nx = randomInt(-58, 58);
          ny = randomInt(-64, 64);
        }
        return { ...v, xPx: nx, yPx: ny };
      }),
    );
  }, []);

  const handleParticleClick = useCallback(
    (i: number, e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (tapFxRef.current[i]) return;
      const p = PARTICLES[i];
      const glyph = particleEmojis[i] ?? p.emoji ?? "✨";
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = cx - e.clientX;
      const dy = cy - e.clientY;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const dist = Math.max(window.innerWidth, window.innerHeight) * 1.15;

      const fxKind: TapFx["k"] =
        p.anim === "rocketMoon" ||
        p.anim === "rocketEarth" ||
        p.anim === "rocketBack"
          ? "rocket"
          : glyph === "🤡"
            ? "hop"
            : FLEE_ON_CLICK.has(glyph)
              ? "flee"
              : "nudge";
      setTapFx((prev) => {
        const next = [...prev];
        if (fxKind === "rocket" && p.anim === "rocketMoon") {
          next[i] = { k: "rocket", tx: dist * 0.88, ty: -dist * 0.82 };
        } else if (fxKind === "rocket" && p.anim === "rocketEarth") {
          next[i] = { k: "rocket", tx: dist * 0.42, ty: -dist * 0.9 };
        } else if (fxKind === "rocket" && p.anim === "rocketBack") {
          next[i] = { k: "rocket", tx: -dist * 0.92, ty: dist * 0.8 };
        } else if (fxKind === "hop") {
          next[i] = { k: "hop", tx: ux * 64, ty: uy * 64 };
        } else if (fxKind === "flee") {
          next[i] = { k: "flee", tx: ux * dist, ty: uy * dist };
        } else {
          next[i] = { k: "nudge" };
        }
        return next;
      });

      const ms =
        fxKind === "rocket"
          ? 520
          : fxKind === "flee"
            ? 1180
            : fxKind === "hop"
              ? 330
              : 320;
      window.setTimeout(() => {
        setTapFx((prev) => {
          const next = [...prev];
          next[i] = null;
          return next;
        });
        if (fxKind === "rocket" || fxKind === "flee") {
          rerollSpawnAtIndex(i);
        }
      }, ms);
    },
    [particleEmojis, rerollSpawnAtIndex],
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setParticleEmojis((prev) => {
        let changed = false;
        const next = [...prev];
        for (let i = 0; i < PARTICLES.length; i++) {
          const p = PARTICLES[i]!;
          if (p.emoji) continue;
          if (now < (nextEmojiSwapAtRef.current[i] ?? 0)) continue;

          const current = prev[i] ?? "✨";
          const glyph = pickSceneEmoji(p, current);
          next[i] = glyph;
          nextEmojiSwapAtRef.current[i] = now + holdMsForEmoji(p, glyph);
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 750);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setParticleVariance((prev) =>
        enforceNonRocketSpacing(prev.map((v, i) => {
          const p = PARTICLES[i];
          if (!p) return v;

          if (p.anim === "rocketBack") {
            return {
              ...v,
              rocketBackVariant: nextVariantIndex(v.rocketBackVariant),
              xPx: randomInt(-52, 52),
              yPx: randomInt(-56, 56),
            };
          }

          if (p.anim === "rocketEarth") {
            return {
              ...v,
              earthVariant: nextVariantIndex(v.earthVariant),
              xPx: randomInt(-42, 42),
              yPx: randomInt(-42, 42),
            };
          }

          if (p.anim === "rocketMoon") {
            return {
              ...v,
              moonOrbitRem: randomInt(195, 320) / 100,
              xPx: randomInt(-36, 36),
              yPx: randomInt(-36, 36),
            };
          }

          // Gutters: gentle drift so spawn locations keep changing in-session.
          return {
            ...v,
            xPx: Math.max(-58, Math.min(58, v.xPx + randomInt(-12, 12))),
            yPx: Math.max(-64, Math.min(64, v.yPx + randomInt(-14, 14))),
          };
        })),
      );
    }, 9300);
    return () => clearInterval(id);
  }, []);

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
          "categories" in data &&
          Array.isArray((data as { categories: unknown }).categories)
        ) {
          const categories = (data as { categories: TopicCategory[] }).categories.filter(
            (c) =>
              c &&
              typeof c.id === "string" &&
              typeof c.label === "string" &&
              Array.isArray(c.topics) &&
              c.topics.length > 0,
          );
          if (categories.length > 0) {
            setTopicCategories(categories);
            setActiveTopicGroup(categories[0].id);
          }
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
    <div className="relative z-20 mx-auto flex w-full max-w-lg flex-col gap-8 px-4 py-12">
      {PARTICLES.map((p, i) => {
        const variance = particleVariance[i] ?? randomVariant();
        const isRocket =
          p.anim === "rocketBack" ||
          p.anim === "rocketMoon" ||
          p.anim === "rocketEarth";
        const animClass =
          p.anim === "rocketBack"
            ? variance.rocketBackVariant === 1
              ? "setup-p-rocket-back"
              : variance.rocketBackVariant === 2
                ? "setup-p-rocket-back-v2"
                : "setup-p-rocket-back-v3"
            : "setup-p-gutter";
        const hideGutterOnXs = !isRocket && !p.desktopOnly;
        const glyph = particleEmojis[i] ?? p.emoji ?? "✨";
        const fx = tapFx[i];
        const fleeing = fx?.k === "flee" || fx?.k === "rocket";
        const hopping = fx?.k === "hop";
        const nudge = fx?.k === "nudge";
        const cardVars = {
          "--pd": p.dur,
          "--pdd": p.delay,
          "--orbit-r": `${variance.moonOrbitRem}rem`,
        } as React.CSSProperties;

        const wrapperStyle: React.CSSProperties = {
          position: "fixed",
          ...(p.bottom !== undefined
            ? {
                bottom: `calc(${p.bottom} + ${variance.yPx}px)`,
                top: "auto",
              }
            : { top: `calc(${p.top ?? "0"} + ${variance.yPx}px)` }),
          ...(p.right !== undefined
            ? {
                right: `calc(${p.right} + ${variance.xPx}px)`,
                left: "auto",
              }
            : { left: `calc(${p.left ?? "0"} + ${variance.xPx}px)` }),
          opacity: p.bright ? 0.88 : 0.4,
          pointerEvents: "auto",
          cursor: "pointer",
          userSelect: "none",
          // Bigger invisible hitbox for easier taps/clicks on moving emojis.
          padding: "10px",
          margin: "-10px",
          // Setup form container is z-20; keep rockets below input fields.
          zIndex: isRocket ? 12 : 5,
          ...(fx?.k === "flee"
            ? ({
                "--flee-tx": `${fx.tx}px`,
                "--flee-ty": `${fx.ty}px`,
                animation:
                  "setup-flee-wobble 0.95s cubic-bezier(0.2, 0.85, 0.25, 1) 0.12s both",
              } as React.CSSProperties)
            : {
                transform:
                  (fleeing || hopping) && fx
                    ? `translate(${fx.tx}px, ${fx.ty}px)`
                    : undefined,
                transition:
                  (fleeing || hopping) && fx
                    ? fx.k === "rocket"
                      ? "transform 0.46s cubic-bezier(0.2, 0.95, 0.3, 1)"
                      : fx.k === "hop"
                        ? "transform 0.28s cubic-bezier(0.18, 0.9, 0.25, 1)"
                        : "transform 0.5s cubic-bezier(0.2, 0.85, 0.25, 1)"
                    : "top 1.8s ease, right 1.8s ease, bottom 1.8s ease, left 1.8s ease",
              }),
        };

        if (p.anim === "rocketMoon") {
          return (
            <div
              key={i}
              aria-hidden
              className={`touch-manipulation ${p.desktopOnly ? "hidden sm:block" : ""} ${hideGutterOnXs ? "max-sm:hidden" : ""}`}
              onClick={(e) => handleParticleClick(i, e)}
              style={wrapperStyle}
            >
              <div className="setup-moon-stack" style={cardVars}>
                <span className="setup-moon-body">🌕</span>
                <div
                  className="setup-moon-orbit-arm"
                  style={{ animation: fleeing ? "none" : undefined }}
                >
                  <span
                    className="setup-moon-rocket setup-p setup-p-rocket-flame"
                    style={{
                      animation: fleeing ? "none" : undefined,
                    }}
                  >
                    🚀
                  </span>
                </div>
              </div>
            </div>
          );
        }

        if (p.anim === "rocketEarth") {
          return (
            <div
              key={i}
              aria-hidden
              className={`touch-manipulation ${p.desktopOnly ? "hidden sm:block" : ""} ${hideGutterOnXs ? "max-sm:hidden" : ""}`}
              onClick={(e) => handleParticleClick(i, e)}
              style={wrapperStyle}
            >
              <div className="setup-earth-stack" style={cardVars}>
                <span className="setup-earth-globe">🌍</span>
                <span
                  className={`setup-earth-rocket setup-p setup-p-rocket-flame ${
                    variance.earthVariant === 1
                      ? ""
                      : variance.earthVariant === 2
                        ? "setup-earth-rocket-v2"
                        : "setup-earth-rocket-v3"
                  }`}
                  style={{
                    animation: fleeing ? "none" : undefined,
                  }}
                >
                  🚀
                </span>
              </div>
            </div>
          );
        }

        return (
          <div
            key={i}
            aria-hidden
            className={`touch-manipulation ${p.desktopOnly ? "hidden sm:block" : ""} ${hideGutterOnXs ? "max-sm:hidden" : ""}`}
            onClick={(e) => handleParticleClick(i, e)}
            style={wrapperStyle}
          >
            <span
              className={`setup-p${fleeing ? "" : ` ${animClass}`}${isRocket ? " setup-p-rocket-flame" : ""}${!isRocket && p.bright ? " setup-p-glow" : ""}`}
              style={
                {
                  display: "block",
                  fontSize: p.size,
                  ...cardVars,
                  animation: fleeing ? "none" : undefined,
                } as React.CSSProperties
              }
            >
              <span
                className={`inline-block${nudge ? " setup-p-nudge-pulse" : ""}`}
              >
                {glyph}
              </span>
            </span>
          </div>
        );
      })}
      <div className="relative z-30 flex flex-col gap-8">
        <header className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
            Debately
          </h1>
          <p className="mt-1 text-sm font-medium uppercase tracking-widest text-fuchsia-400/90">
            Solo
          </p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            Start with a topic, pick your side, and jump in. The Judge factchecks
            both sides and scores the debate.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-4 shadow-lg shadow-black/10">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  Pick a topic
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Fresh topics every day — or let Debately pick for you.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRandomTopic}
                disabled={loadingTopics || !topicCategories}
                className="shrink-0 cursor-pointer rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition-all hover:border-indigo-400 hover:bg-indigo-500/15 hover:text-indigo-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Random
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
                <div className="grid gap-2 sm:grid-cols-2">
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

                <div className="grid gap-2 sm:grid-cols-2">
                  {activeStarterTopics.map((starterTopic) => {
                    const selected = topic.trim() === starterTopic;
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
        </section>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Topic
          </label>
          <textarea
            maxLength={200}
            rows={3}
            value={topic}
            onChange={(e) => onTopic(e.target.value)}
            placeholder='e.g. "Remote work is better than working from the office"'
            className="resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-base leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-zinc-500">Or write your own statement.</span>
            <span className="text-zinc-600">{topic.length}/200</span>
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
              Time per turn
            </span>
            <span className={`text-sm font-semibold transition-colors ${timedModeEnabled ? "text-indigo-300" : "text-zinc-500"}`}>
              {timedModeEnabled ? formatTimer(turnTimerSeconds) : "No timer"}
            </span>
          </div>

          {timedModeEnabled ? (
            <>
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
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">You can pause at any time.</p>
                <button
                  type="button"
                  onClick={() => setTimedMode(false)}
                  className="cursor-pointer text-xs text-zinc-600 transition-colors hover:text-zinc-400"
                >
                  Play without a timer →
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">No countdown, no pressure.</p>
              <button
                type="button"
                onClick={() => setTimedMode(true)}
                className="cursor-pointer text-xs text-zinc-600 transition-colors hover:text-zinc-400"
              >
                ← Add a timer
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={!canStart}
          onClick={onStart}
          className="cursor-pointer rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition-all hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-600/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none disabled:hover:scale-100"
        >
          Start debate
        </button>

        <footer className="flex items-center justify-center gap-4 text-xs text-zinc-600">
          <span>© {new Date().getFullYear()} Bluume, Inc</span>
          <Link href="/privacy" className="transition-colors hover:text-zinc-400">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-zinc-400">
            Terms
          </Link>
        </footer>
      </div>
    </div>
  );
}
