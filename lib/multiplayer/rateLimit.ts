import {
  VISITOR_COOKIE_NAME,
  normalizeVisitorId,
} from "@/lib/visitorIdentity";

type Bucket = {
  tokens: number;
  refilledAt: number;
};

const buckets = new Map<string, Bucket>();

const CAPACITY = Number(process.env.MULTIPLAYER_CREATE_CAPACITY ?? 10);
const REFILL_PER_HOUR = Number(process.env.MULTIPLAYER_CREATE_REFILL_PER_HOUR ?? 10);

function shouldTrustProxyHeaders(): boolean {
  const raw = process.env.MULTIPLAYER_TRUST_PROXY_HEADERS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const part = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(prefix));
  if (!part) return null;
  return decodeURIComponent(part.slice(prefix.length));
}

export function getClientKey(request: Request): string {
  const visitorId = normalizeVisitorId(readCookie(request, VISITOR_COOKIE_NAME));
  if (visitorId) return `visitor:${visitorId}`;

  if (shouldTrustProxyHeaders()) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return `ip:${first}`;
    }
    const real = request.headers.get("x-real-ip");
    if (real) return `ip:${real.trim()}`;
  }
  return "ip:unknown";
}

function refill(bucket: Bucket, now: number): void {
  if (REFILL_PER_HOUR <= 0) return;
  const msPerToken = (60 * 60 * 1000) / REFILL_PER_HOUR;
  const elapsed = now - bucket.refilledAt;
  if (elapsed <= 0) return;
  const tokensToAdd = Math.floor(elapsed / msPerToken);
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(CAPACITY, bucket.tokens + tokensToAdd);
    bucket.refilledAt += tokensToAdd * msPerToken;
  }
}

export function tryConsume(key: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: CAPACITY, refilledAt: now };
    buckets.set(key, bucket);
  }
  refill(bucket, now);
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}
