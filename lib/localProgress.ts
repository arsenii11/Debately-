import type { Verdict } from "@/lib/types";

export type ProgressSkillKey = keyof Verdict["breakdown"];

export type DebatelyProgress = {
  lastDebateDate: string | null;
  streakDays: number;
  graceAvailable: boolean;
  debatesToday: number;
  /** Finished solo debates (used for onboarding difficulty). */
  soloDebatesCompleted: number;
  skills: Record<ProgressSkillKey, number>;
};

export type DebatelyRank = {
  xp: number;
  level: number;
  levelName: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
  chestLabel: string;
};

const STORAGE_KEY = "debately:progress:v1";
const SKILL_KEYS: ProgressSkillKey[] = [
  "factual",
  "logic",
  "relevance",
  "rhetoric",
];

const LEVEL_NAMES = [
  "Rookie Talker",
  "Claim Grinder",
  "Logic Dealer",
  "Evidence Shark",
  "Rhetoric Boss",
  "Debate Whale",
] as const;

const DEFAULT_PROGRESS: DebatelyProgress = {
  lastDebateDate: null,
  streakDays: 0,
  graceAvailable: true,
  debatesToday: 0,
  soloDebatesCompleted: 0,
  skills: {
    factual: 50,
    logic: 50,
    relevance: 50,
    rhetoric: 50,
  },
};

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const from = Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1);
  const to = Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1);
  return Math.floor((to - from) / 86_400_000);
}

function normalizeProgress(raw: unknown): DebatelyProgress {
  if (!raw || typeof raw !== "object") return DEFAULT_PROGRESS;
  const obj = raw as Partial<DebatelyProgress>;
  const skills = { ...DEFAULT_PROGRESS.skills };
  if (obj.skills && typeof obj.skills === "object") {
    for (const key of SKILL_KEYS) {
      const value = Number(obj.skills[key]);
      if (Number.isFinite(value)) {
        skills[key] = Math.max(0, Math.min(100, Math.round(value)));
      }
    }
  }
  return {
    lastDebateDate:
      typeof obj.lastDebateDate === "string" ? obj.lastDebateDate : null,
    streakDays:
      typeof obj.streakDays === "number" && obj.streakDays > 0
        ? Math.floor(obj.streakDays)
        : 0,
    graceAvailable: obj.graceAvailable !== false,
    debatesToday:
      typeof obj.debatesToday === "number" && obj.debatesToday > 0
        ? Math.floor(obj.debatesToday)
        : 0,
    soloDebatesCompleted:
      typeof obj.soloDebatesCompleted === "number" && obj.soloDebatesCompleted > 0
        ? Math.floor(obj.soloDebatesCompleted)
        : 0,
    skills,
  };
}

function readStoredProgress(): DebatelyProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    return normalizeProgress(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_PROGRESS;
  }
}

function writeStoredProgress(progress: DebatelyProgress): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* best effort */
  }
}

export function loadDebatelyProgress(): DebatelyProgress {
  const progress = readStoredProgress();
  const today = todayLocal();
  if (!progress.lastDebateDate) return progress;
  const gap = daysBetween(progress.lastDebateDate, today);
  if (gap === 0) return progress;
  if (gap === 1) {
    return { ...progress, debatesToday: 0, graceAvailable: true };
  }
  if (gap === 2 && progress.graceAvailable) {
    return { ...progress, debatesToday: 0, graceAvailable: false };
  }
  return {
    ...DEFAULT_PROGRESS,
    skills: progress.skills,
    soloDebatesCompleted: progress.soloDebatesCompleted,
  };
}

function averageSkill(progress: DebatelyProgress): number {
  const total = SKILL_KEYS.reduce((sum, key) => sum + progress.skills[key], 0);
  return Math.round(total / SKILL_KEYS.length);
}

function levelFloor(level: number): number {
  return (level - 1) * (level - 1) * 220;
}

export function calculateDebatelyXp(progress: DebatelyProgress | null): number {
  if (!progress) return 0;
  return (
    progress.soloDebatesCompleted * 140 +
    progress.streakDays * 85 +
    progress.debatesToday * 45 +
    Math.max(0, averageSkill(progress) - 50) * 12
  );
}

export function getDebatelyRank(
  progress: DebatelyProgress | null,
): DebatelyRank {
  const xp = calculateDebatelyXp(progress);
  let level = 1;
  while (level < 99 && xp >= levelFloor(level + 1)) {
    level += 1;
  }
  const currentLevelXp = levelFloor(level);
  const nextLevelXp = levelFloor(level + 1);
  const span = Math.max(1, nextLevelXp - currentLevelXp);
  const progressPct = Math.max(
    0,
    Math.min(100, Math.round(((xp - currentLevelXp) / span) * 100)),
  );
  const levelName =
    LEVEL_NAMES[Math.min(LEVEL_NAMES.length - 1, Math.floor((level - 1) / 3))] ??
    LEVEL_NAMES[0];
  const chestLabel =
    progressPct >= 92
      ? "Jackpot chest armed"
      : progressPct >= 70
        ? "Rare chest warming up"
        : progressPct >= 35
          ? "Bronze chest loading"
          : "Empty chest. Feed it arguments.";

  return {
    xp,
    level,
    levelName,
    currentLevelXp,
    nextLevelXp,
    progressPct,
    chestLabel,
  };
}

export function estimateVerdictXp(verdict: Verdict): number {
  const scoreBonus = Math.max(0, verdict.score_player - 45);
  const winBonus = verdict.score_player > verdict.score_opponent ? 90 : 25;
  const closeGameBonus =
    Math.abs(verdict.score_player - verdict.score_opponent) <= 7 ? 35 : 0;
  return 110 + scoreBonus + winBonus + closeGameBonus;
}

export function recordDebatelyVerdict(verdict: Verdict): DebatelyProgress {
  const current = loadDebatelyProgress();
  const today = todayLocal();
  const gap = current.lastDebateDate
    ? daysBetween(current.lastDebateDate, today)
    : Number.POSITIVE_INFINITY;
  const streakDays =
    gap === 0
      ? current.streakDays || 1
      : gap <= 2
        ? Math.max(1, current.streakDays + 1)
        : 1;
  const debatesToday = gap === 0 ? current.debatesToday + 1 : 1;
  const skills = { ...current.skills };
  for (const key of SKILL_KEYS) {
    const [playerScore] = verdict.breakdown[key];
    skills[key] = Math.round(skills[key] * 0.65 + playerScore * 0.35);
  }
  const next = {
    lastDebateDate: today,
    streakDays,
    graceAvailable: gap === 2 ? false : current.graceAvailable,
    debatesToday,
    soloDebatesCompleted: current.soloDebatesCompleted + 1,
    skills,
  };
  writeStoredProgress(next);
  return next;
}
