"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import type { DebatelyProgress, ProgressSkillKey } from "@/lib/localProgress";
import { getNickname, setNickname as persistMpNickname } from "@/lib/multiplayer/clientAuth";

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

import { TopicPicker } from "@/components/TopicPicker";

const PROGRESS_SKILL_LABELS: Record<ProgressSkillKey, string> = {
  factual: "Evidence",
  logic: "Logic",
  relevance: "Relevance",
  rhetoric: "Rhetoric",
};

const PROGRESS_SKILL_COLORS: Record<ProgressSkillKey, string> = {
  factual: "from-emerald-400 to-teal-300",
  logic: "from-indigo-400 to-sky-300",
  relevance: "from-fuchsia-400 to-pink-300",
  rhetoric: "from-amber-300 to-orange-300",
};

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
  progress: DebatelyProgress | null;
  onStart: () => void;
};

type HomeMode = "solo" | "multiplayer" | "school";

const HOME_MODES: Array<{
  id: HomeMode;
  label: string;
  shortLabel: string;
}> = [
  { id: "solo", label: "Solo", shortLabel: "Solo" },
  { id: "multiplayer", label: "Multiplayer", shortLabel: "Friends" },
  { id: "school", label: "Debate School", shortLabel: "School" },
];

function PlayWithFriendPod({
  nickname,
  centered = false,
}: {
  nickname: string;
  centered?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpNickHydrated, setMpNickHydrated] = useState("");
  useLayoutEffect(() => {
    setMpNickHydrated(getNickname().trim());
  }, []);

  const effectiveLobbyNickname = (nickname.trim() || mpNickHydrated).slice(0, 32);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const cleanedNickname = effectiveLobbyNickname;
      const res = await fetch("/api/multiplayer/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: cleanedNickname }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Could not create lobby.");
      }
      const data = (await res.json()) as {
        sessionId: string;
        playerToken: string;
      };
      try {
        const tokenMapRaw = window.localStorage.getItem("debately:mp:tokens");
        const tokenMap = tokenMapRaw ? (JSON.parse(tokenMapRaw) as Record<string, string>) : {};
        tokenMap[data.sessionId] = data.playerToken;
        window.localStorage.setItem("debately:mp:tokens", JSON.stringify(tokenMap));
        if (cleanedNickname) persistMpNickname(cleanedNickname);
      } catch {
        /* ignore storage failures */
      }
      window.location.href = `/play/${data.sessionId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create lobby.");
      setBusy(false);
    }
  }, [effectiveLobbyNickname]);

  return (
    <section className="w-full max-w-lg rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-4 sm:p-5">
      <div
        className={`flex h-full flex-col justify-between gap-4 ${centered ? "items-center text-center" : ""}`}
      >
        <div className={centered ? "flex flex-col items-center" : ""}>
          <p
            className={`text-xs leading-relaxed text-zinc-500 ${centered ? "text-center" : ""}`}
          >
            <span className="font-medium text-indigo-400/95">Multiplayer</span>
            <span className="text-zinc-600"> — </span>
            <span>private lobby, share a link, debate a real person.</span>
          </p>
          <h2 className="mt-4 text-xl font-semibold leading-tight text-zinc-50 sm:text-2xl">
            Play with a friend
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
            Create a private lobby, share the link, and debate a real person.
            The Judge fact-checks each move and scores the match.
          </p>
        </div>
        <div className={`flex flex-col gap-2 ${centered ? "w-full items-center" : ""}`}>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="inline-flex w-fit cursor-pointer items-center justify-center rounded-xl border border-indigo-500/60 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-100 transition-colors hover:border-indigo-400 hover:bg-indigo-500/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Creating lobby…" : "Create lobby link →"}
          </button>
          {error ? (
            <p className="text-xs text-rose-300">{error}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

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
  progress,
  onStart,
}: Props) {
  const canStart = nickname.trim().length > 0 && topic.trim().length > 0;
  const [homeMode, setHomeMode] = useState<HomeMode>("solo");
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
  const progressSkills = progress?.skills;

  useEffect(() => {
    const syncFromHash = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h === "topic-picker") {
        setHomeMode("solo");
        window.requestAnimationFrame(() => {
          document
            .getElementById("topic-picker")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

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

  return (
    <div className="relative z-20 mx-auto flex w-full max-w-2xl flex-col gap-8 overflow-x-hidden px-4 py-10 sm:py-12">
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
          pointerEvents: "none",
          userSelect: "none",
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

        const hitTargetClass =
          "inline-block cursor-pointer touch-manipulation rounded-md p-2 -m-2 [pointer-events:auto]";

        if (p.anim === "rocketMoon") {
          return (
            <div
              key={i}
              aria-hidden
              className={`${p.desktopOnly ? "hidden sm:block" : ""} ${hideGutterOnXs ? "max-sm:hidden" : ""}`}
              style={wrapperStyle}
            >
              <div
                role="presentation"
                className={hitTargetClass}
                onClick={(e) => handleParticleClick(i, e)}
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
            </div>
          );
        }

        if (p.anim === "rocketEarth") {
          return (
            <div
              key={i}
              aria-hidden
              className={`${p.desktopOnly ? "hidden sm:block" : ""} ${hideGutterOnXs ? "max-sm:hidden" : ""}`}
              style={wrapperStyle}
            >
              <div
                role="presentation"
                className={hitTargetClass}
                onClick={(e) => handleParticleClick(i, e)}
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
            </div>
          );
        }

        return (
          <div
            key={i}
            aria-hidden
            className={`${p.desktopOnly ? "hidden sm:block" : ""} ${hideGutterOnXs ? "max-sm:hidden" : ""}`}
            style={wrapperStyle}
          >
            <div
              role="presentation"
              className={hitTargetClass}
              onClick={(e) => handleParticleClick(i, e)}
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
          </div>
        );
      })}
      <div className="relative z-[100] isolate mx-auto flex w-full max-w-2xl flex-col gap-8 [pointer-events:auto]">
        <header className="flex flex-col items-center gap-5 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Debately
          </h1>
          <nav
            className="flex w-full max-w-lg justify-center px-0.5 sm:max-w-xl"
            aria-label="App mode"
          >
            <div
              className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/55 p-1 shadow-lg shadow-black/20"
              role="tablist"
            >
              {HOME_MODES.map((m) => {
                const active = homeMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setHomeMode(m.id)}
                    className={`touch-manipulation flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-1.5 py-2.5 text-center text-[11px] font-semibold leading-tight transition-all sm:min-h-12 sm:px-2 sm:text-sm ${
                      active
                        ? "bg-gradient-to-r from-fuchsia-600/90 to-pink-600/90 text-white shadow-md shadow-fuchsia-950/40"
                        : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
                    }`}
                  >
                    <span className="max-[380px]:hidden">{m.label}</span>
                    <span className="hidden max-[380px]:inline">
                      {m.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
          <p className="max-w-md text-sm leading-relaxed text-zinc-500">
            {homeMode === "solo"
              ? "Practice against the AI with a neutral Judge."
              : homeMode === "multiplayer"
                ? "Create a lobby and debate someone you know."
                : "Learn why structured argument practice pays off."}
          </p>
        </header>

        {homeMode === "solo" ? (
          <div className="flex flex-col gap-6">
            <section
              id="topic-picker"
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-center sm:p-6"
            >
              <div className="border-b border-zinc-800/80 pb-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-400/90">
                  You vs AI
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
                  What do you want to debate?
                </h2>
              </div>

              <div className="mt-5 text-left">
                <TopicPicker selectedTopic={topic} onTopic={onTopic} />
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-center sm:p-6">
              <div className="border-b border-zinc-800/80 pb-4 text-center">
                <h2 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
                  Your position
                </h2>
              </div>

              <div className="mt-5 flex flex-col gap-5 text-left">
                <div className="flex flex-col gap-2">
                  <label className="text-base font-semibold text-zinc-100 sm:text-lg">
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
                    <span className="text-zinc-500">
                      Optional: refine the selected topic.
                    </span>
                    <span className="text-zinc-600">{topic.length}/200</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-base font-semibold text-zinc-100 sm:text-lg">
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
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-center sm:p-6">
              <div className="border-b border-zinc-800/80 pb-4 text-center">
                <h2 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
                  Nickname and pacing
                </h2>
              </div>

              <div className="mt-5 flex flex-col gap-5 text-left">
                <div className="flex flex-col gap-2">
                  <label className="text-base font-semibold text-zinc-100 sm:text-lg">
                    Nickname
                  </label>
                  <input
                    id="setup-nickname-input"
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
                    <span className="text-base font-semibold text-zinc-100 sm:text-lg">
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
                    <span className="text-base font-semibold text-zinc-100 sm:text-lg">
                      Time per turn
                    </span>
                    <span
                      className={`text-sm font-semibold transition-colors ${timedModeEnabled ? "text-indigo-300" : "text-zinc-500"}`}
                    >
                      {timedModeEnabled
                        ? formatTimer(turnTimerSeconds)
                        : "No timer"}
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
                        onChange={(e) =>
                          onTurnTimerSeconds(Number(e.target.value))
                        }
                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-indigo-500"
                      />
                      <div className="flex justify-between text-xs text-zinc-600">
                        <span>{formatTimer(MIN_TURN_TIMER_SECONDS)}</span>
                        <span>{formatTimer(MAX_TURN_TIMER_SECONDS)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span />
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
                      <p className="text-xs text-zinc-500">
                        No countdown, no pressure.
                      </p>
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
              </div>
            </section>

            <button
              type="button"
              disabled={!canStart}
              onClick={onStart}
              className="cursor-pointer rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-900/30 transition-all hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-600/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none disabled:hover:scale-100 sm:text-lg"
            >
              Start debate vs AI →
            </button>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-center sm:p-5">
              <div className="flex flex-col gap-4 text-left">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-zinc-100 sm:text-lg">
                    Your progress
                  </h3>
                  <span className="rounded-xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-right">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Streak
                    </span>
                    <span className="mt-1 block text-3xl font-semibold tabular-nums text-zinc-100">
                      {progress?.streakDays ?? 0}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {(progress?.streakDays ?? 0) === 1 ? "day" : "days"}
                    </span>
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Today
                    </p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-3xl font-semibold text-zinc-100">
                        {progress?.debatesToday ?? 0}
                      </span>
                      <span className="pb-1 text-sm text-zinc-400">
                        debates today
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      {progress?.graceAvailable === false
                        ? "Grace day used. Play today to keep the streak."
                        : "One missed day is allowed before the streak resets."}
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Skills
                      </p>
                      <span className="text-xs text-zinc-600">
                        from your verdicts
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {(
                        Object.keys(PROGRESS_SKILL_LABELS) as ProgressSkillKey[]
                      ).map((key) => {
                        const value = progressSkills?.[key] ?? 50;
                        return (
                          <div key={key} className="flex flex-col gap-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-zinc-300">
                                {PROGRESS_SKILL_LABELS[key]}
                              </span>
                              <span className="font-mono text-zinc-500">
                                {value}%
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${PROGRESS_SKILL_COLORS[key]}`}
                                style={{ width: `${value}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {homeMode === "multiplayer" ? (
          <div className="flex flex-col items-center gap-6 text-center">
            <PlayWithFriendPod nickname={nickname} centered />
            <p className="max-w-md text-sm leading-relaxed text-zinc-500">
              Your lobby name uses the Solo nickname when set, or a name you
              have used in multiplayer before.
            </p>
            <button
              type="button"
              onClick={() => setHomeMode("solo")}
              className="text-sm font-medium text-indigo-400 transition-colors hover:text-indigo-300"
            >
              Set nickname in Solo →
            </button>
          </div>
        ) : null}

        {homeMode === "school" ? (
          <div className="flex flex-col items-center gap-6 text-center">
            <section className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-400/90">
                Preview · Lessons coming later
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
                Why debate practice matters
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
                Turn opinions into claims you can defend, tighten evidence, and
                get sharper under pressure — the same moves behind clear
                writing, decisions, and working well with AI.
              </p>
              <ul className="mx-auto mt-6 max-w-md space-y-3 text-left text-sm text-zinc-300">
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 text-fuchsia-400">◆</span>
                  <span>
                    Structured lessons and drills are on the roadmap; until
                    then, Solo is your practice loop.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 text-indigo-400">◆</span>
                  <span>
                    The Judge scores evidence, logic, relevance, and rhetoric —
                    not who sounds loudest.
                  </span>
                </li>
              </ul>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/debate-school"
                  className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition-colors hover:bg-indigo-500 sm:w-auto"
                >
                  Open full Debate School preview →
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setHomeMode("solo");
                    window.requestAnimationFrame(() => {
                      document
                        .getElementById("topic-picker")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                  className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-zinc-600 bg-zinc-950/50 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-900 sm:w-auto"
                >
                  Practice in Solo
                </button>
              </div>
            </section>
          </div>
        ) : null}

        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-zinc-600">
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
