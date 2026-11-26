import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Upstash's Lua scripts use an Upstash-only flag, so they can't run against a
// local Redis. These tests mock the client and check our glue code instead.
const limit = vi.fn();
const ctorArgs: unknown[] = [];

vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: vi.fn(() => ({})) } }));
vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = vi.fn((requests: number, window: string) => ({ requests, window }));
    limit = limit;
    constructor(opts: unknown) {
      ctorArgs.push(opts);
    }
  }
  return { Ratelimit };
});

async function load() {
  vi.resetModules();
  return import("./rateLimit");
}

const req = new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1" } });

describe("enforceRateLimit with Upstash", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    ctorArgs.length = 0;
    limit.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("configures a sliding window per route and keys by user or IP", async () => {
    limit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    const { enforceRateLimit } = await load();
    expect(await enforceRateLimit(req, "generate")).toBeNull();
    expect(await enforceRateLimit(req, "keys", "u1")).toBeNull();
    expect(ctorArgs).toEqual([
      expect.objectContaining({ prefix: "aipasta:rl:generate", limiter: { requests: 60, window: "60 s" } }),
      expect.objectContaining({ prefix: "aipasta:rl:keys", limiter: { requests: 20, window: "60 s" } }),
    ]);
    expect(limit.mock.calls).toEqual([["ip:1.1.1.1"], ["user:u1"]]);
  });

  it("returns 429 with the time until reset", async () => {
    limit.mockResolvedValue({ success: false, reset: Date.now() + 12_500 });
    const { enforceRateLimit } = await load();
    const res = await enforceRateLimit(req, "generate");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("13");
  });

  it("fails open and logs once when Redis errors", async () => {
    limit.mockRejectedValue(new Error("connection refused"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { enforceRateLimit } = await load();
    expect(await enforceRateLimit(req, "generate")).toBeNull();
    expect(await enforceRateLimit(req, "generate")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
