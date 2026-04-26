type Bucket = {
  tokens: number;
  refilledAt: number;
};

const buckets = new Map<string, Bucket>();

const CAPACITY = Number(process.env.MULTIPLAYER_CREATE_CAPACITY ?? 10);
const REFILL_PER_HOUR = Number(process.env.MULTIPLAYER_CREATE_REFILL_PER_HOUR ?? 10);

export function getClientKey(request: Request): string {
  // Trust proxy chain headers when present; fall back to a static key.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return `ip:${real.trim()}`;
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
