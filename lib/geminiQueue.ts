/**
 * Serializes all Gemini calls in one Node process and spaces them apart so
 * free-tier RPM limits (e.g. 20 req/min) are less likely to hit 429.
 * Tradeoff: slower under concurrent users; set GEMINI_MIN_INTERVAL_MS=0 to disable pacing only.
 */

import { debatelyLog } from "@/lib/debatelyLog";
import { getRedisClient, isRedisConfigured } from "@/lib/redis";

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
  if (isRedisConfigured()) {
    return runRedisThrottledGemini(fn);
  }

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

async function reserveRedisGeminiSlot(minGap: number): Promise<number> {
  if (minGap <= 0) return 0;
  const client = await getRedisClient();
  if (!client) return 0;

  const now = Date.now();
  const key = "debately:gemini:next_allowed_at";
  const script = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local gap = tonumber(ARGV[2])
local raw = redis.call("GET", key)
local next_allowed = tonumber(raw or "0")
local start_at = now
if next_allowed and next_allowed > now then
  start_at = next_allowed
end
redis.call("SET", key, tostring(start_at + gap), "PX", math.max(gap * 4, 60000))
return start_at - now
`;

  const result = await client.eval(script, {
    keys: [key],
    arguments: [String(now), String(minGap)],
  });
  const wait = typeof result === "number" ? result : Number(result);
  return Number.isFinite(wait) ? Math.max(0, wait) : 0;
}

async function runRedisThrottledGemini<T>(fn: () => Promise<T>): Promise<T> {
  const minGap = getMinIntervalMs();
  if (minGap > 0) {
    try {
      const wait = await reserveRedisGeminiSlot(minGap);
      if (wait > 0) {
        if (wait >= 1500) {
          debatelyLog("gemini", "info", "redis rate-limit pacing before request", {
            waitMs: wait,
            minIntervalMs: minGap,
          });
        }
        await sleep(wait);
      }
    } catch (err) {
      debatelyLog("gemini", "warn", "redis throttle failed; using local pacing", {
        err: err instanceof Error ? err.message : String(err),
      });
      return runSerializedGeminiLocal(fn);
    }
  }
  return fn();
}

function runSerializedGeminiLocal<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const minGap = getMinIntervalMs();
    if (minGap > 0) {
      const now = Date.now();
      const wait = Math.max(0, lastCallEndedAt + minGap - now);
      if (wait > 0) await sleep(wait);
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
