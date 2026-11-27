import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { safeErrorMessage } from "@/app/library/redact";

export type LimitName = "generate" | "comparisons" | "keys" | "templates";

// Sliding-window limits. One full comparison is up to 6 generate requests.
export const LIMITS: Record<LimitName, { requests: number; windowSec: number }> = {
  generate: { requests: 60, windowSec: 60 },
  comparisons: { requests: 20, windowSec: 60 },
  keys: { requests: 20, windowSec: 60 },
  templates: { requests: 30, windowSec: 60 },
};

type Check = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * Per-process sliding-window log. Used when Upstash isn't configured. It only
 * limits a single server instance, so on serverless it's a safety net, not a
 * real limit: configure Upstash in production.
 */
export class MemoryLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly requests: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000
  ) {}

  check(key: string, now = Date.now()): Check {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.requests) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.delete(key); // re-insert so Map order tracks recency
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value!);
    return { ok: true };
  }
}

type Limiter = (key: string) => Promise<Check>;
const limiters = new Map<LimitName, Limiter>();
let lastFailureLog = 0;

function getLimiter(name: LimitName): Limiter {
  const existing = limiters.get(name);
  if (existing) return existing;

  const { requests, windowSec } = LIMITS[name];
  let limiter: Limiter;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const upstash = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(requests, `${windowSec} s`),
      prefix: `aipasta:rl:${name}`,
    });
    limiter = async (key) => {
      const res = await upstash.limit(key);
      return res.success
        ? { ok: true }
        : { ok: false, retryAfterSec: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) };
    };
  } else {
    const memory = new MemoryLimiter(requests, windowSec * 1000);
    limiter = async (key) => memory.check(key);
  }
  limiters.set(name, limiter);
  return limiter;
}

/** Best-effort client IP. On Vercel, x-forwarded-for is set by the platform. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Returns a 429 response when the caller is over the limit, otherwise null.
 * Keys on the user when known, else the client IP. Fails open if Redis errors,
 * so a Redis outage doesn't take the app down.
 */
export async function enforceRateLimit(
  req: Request,
  name: LimitName,
  userId: string | null = null
): Promise<NextResponse | null> {
  const key = userId ? `user:${userId}` : `ip:${clientIp(req)}`;
  let result: Check;
  try {
    result = await getLimiter(name)(key);
  } catch (e) {
    // Log at most once a minute so an outage doesn't flood the logs.
    if (Date.now() - lastFailureLog > 60_000) {
      lastFailureLog = Date.now();
      console.error("Rate limiter unavailable, allowing requests:", safeErrorMessage(e));
    }
    return null;
  }
  if (result.ok) return null;
  return NextResponse.json(
    { error: `Too many requests. Try again in ${result.retryAfterSec}s.` },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}
