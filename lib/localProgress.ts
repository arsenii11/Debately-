import type { Verdict } from "@/lib/types";

export type ProgressSkillKey = keyof Verdict["breakdown"];

export type DebatelyProgress = {
  lastDebateDate: string | null;
  streakDays: number;
  graceAvailable: boolean;
  debatesToday: number;
  skills: Record<ProgressSkillKey, number>;
};

const STORAGE_KEY = "debately:progress:v1";
const SKILL_KEYS: ProgressSkillKey[] = [
  "factual",
  "logic",
  "relevance",
  "rhetoric",
];

const DEFAULT_PROGRESS: DebatelyProgress = {
  lastDebateDate: null,
  streakDays: 0,
  graceAvailable: true,
  debatesToday: 0,
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
  return { ...DEFAULT_PROGRESS, skills: progress.skills };
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
    skills,
  };
  writeStoredProgress(next);
  return next;
}
