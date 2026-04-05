/**
 * Serializes all Gemini calls in one Node process and spaces them apart so
 * free-tier RPM limits (e.g. 20 req/min) are less likely to hit 429.
 * Tradeoff: slower under concurrent users; set GEMINI_MIN_INTERVAL_MS=0 to disable pacing only.
 */

import { debatelyLog } from "@/lib/debatelyLog";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let queueTail: Promise<void> = Promise.resolve();

let lastCallEndedAt = 0;

function getMinIntervalMs(): number {
  const raw = process.env.GEMINI_MIN_INTERVAL_MS?.trim();
  /** Default 1200ms: lighter than 3s; set 3000+ if you still hit 429 on free tier. */
  if (raw === undefined || raw === "") return 1200;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1200;
}

/** Run `fn` after previous Gemini work; optional gap before starting (free-tier RPM). */
export function runSerializedGemini<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const minGap = getMinIntervalMs();
    if (minGap > 0) {
      const now = Date.now();
      const wait = Math.max(0, lastCallEndedAt + minGap - now);
      if (wait > 0) {
        if (wait >= 1500) {
          debatelyLog("gemini", "info", "rate-limit pacing before request", {
            waitMs: wait,
            minIntervalMs: minGap,
          });
        }
        await sleep(wait);
      }
    }

    try {
      return await fn();
    } finally {
      lastCallEndedAt = Date.now();
    }
  });

  queueTail = run.then(
    () => {},
    () => {},
  );
  return run;
}
