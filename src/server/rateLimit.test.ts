import { describe, expect, it } from "vitest";
import { MemoryLimiter, clientIp, enforceRateLimit, LIMITS } from "./rateLimit";

describe("MemoryLimiter", () => {
  it("allows up to the limit, then blocks with a retry time", () => {
    const limiter = new MemoryLimiter(3, 60_000);
    const t = 1_000_000;
    expect(limiter.check("a", t).ok).toBe(true);
    expect(limiter.check("a", t + 1).ok).toBe(true);
    expect(limiter.check("a", t + 2).ok).toBe(true);
    expect(limiter.check("a", t + 3)).toEqual({ ok: false, retryAfterSec: 60 });
  });

  it("slides the window", () => {
    const limiter = new MemoryLimiter(2, 10_000);
    limiter.check("a", 0);
    limiter.check("a", 5_000);
    expect(limiter.check("a", 9_000)).toEqual({ ok: false, retryAfterSec: 1 });
    expect(limiter.check("a", 10_001).ok).toBe(true); // first hit expired
  });

  it("tracks keys separately", () => {
    const limiter = new MemoryLimiter(1, 60_000);
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("b").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(false);
  });

  it("caps memory by evicting the least recently used key", () => {
    const limiter = new MemoryLimiter(1, 60_000, 2);
    limiter.check("a", 0);
    limiter.check("b", 0);
    limiter.check("c", 0); // evicts "a"
    expect(limiter.check("a", 1).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("enforceRateLimit", () => {
  it("returns 429 with Retry-After once over the limit", async () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
    for (let i = 0; i < LIMITS.keys.requests; i++) {
      expect(await enforceRateLimit(req, "keys", "rl-test-user")).toBeNull();
    }
    const blocked = await enforceRateLimit(req, "keys", "rl-test-user");
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Another user is unaffected.
    expect(await enforceRateLimit(req, "keys", "someone-else")).toBeNull();
  });
});
