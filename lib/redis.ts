import { randomBytes } from "node:crypto";
import { createClient } from "redis";
import { debatelyLog } from "@/lib/debatelyLog";

type RedisClient = ReturnType<typeof createClient>;

const clientKey = Symbol.for("debately.redis.client");
const subscriberKey = Symbol.for("debately.redis.subscriber");

type GlobalWithRedis = typeof globalThis & {
  [clientKey]?: Promise<RedisClient | null>;
  [subscriberKey]?: Promise<RedisClient | null>;
};

export function getRedisUrl(): string | null {
  const raw =
    process.env.MULTIPLAYER_REDIS_URL?.trim() ||
    process.env.REDIS_URL?.trim() ||
    "";
  return raw.length > 0 ? raw : null;
}

export function isRedisConfigured(): boolean {
  return getRedisUrl() !== null;
}

async function connectRedis(kind: "client" | "subscriber"): Promise<RedisClient | null> {
  const url = getRedisUrl();
  if (!url) return null;

  const client = createClient({ url });
  client.on("error", (err) => {
    debatelyLog("gemini", "warn", `redis ${kind} error`, {
      err: err instanceof Error ? err.message : String(err),
    });
  });

  try {
    await client.connect();
    debatelyLog("gemini", "info", `redis ${kind} connected`);
    return client;
  } catch (err) {
    debatelyLog("gemini", "error", `redis ${kind} connect failed`, {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function getRedisClient(): Promise<RedisClient | null> {
  const g = globalThis as GlobalWithRedis;
  g[clientKey] ??= connectRedis("client").then((client) => {
    if (!client) delete g[clientKey];
    return client;
  });
  return g[clientKey]!;
}

export function getRedisSubscriber(): Promise<RedisClient | null> {
  const g = globalThis as GlobalWithRedis;
  g[subscriberKey] ??= connectRedis("subscriber").then((client) => {
    if (!client) delete g[subscriberKey];
    return client;
  });
  return g[subscriberKey]!;
}

export async function tryAcquireRedisLock(
  key: string,
  ttlMs: number,
): Promise<string | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const token = randomBytes(24).toString("base64url");
  const result = await client.set(key, token, {
    NX: true,
    PX: Math.max(1_000, ttlMs),
  });
  return result === "OK" ? token : null;
}

export async function releaseRedisLock(
  key: string,
  token: string,
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  await client
    .eval(
      `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
      {
        keys: [key],
        arguments: [token],
      },
    )
    .catch(() => undefined);
}
