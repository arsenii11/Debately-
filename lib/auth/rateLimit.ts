import { hmacLookup } from "@/lib/auth/crypto";

type Bucket = {
  tokens: number;
  refilledAt: number;
};

const buckets = new Map<string, Bucket>();
const CAPACITY = Number(process.env.AUTH_CODE_CAPACITY ?? 5);
const REFILL_PER_HOUR = Number(process.env.AUTH_CODE_REFILL_PER_HOUR ?? 5);

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

export function tryConsumeEmailCodeRequest(email: string): boolean {
  const key = `email:${hmacLookup(email)}`;
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

