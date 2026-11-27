import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGenerate, type RunState } from "./generateClient";

function ndjson(events: unknown[], status = 200) {
  const body = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  return new Response(body, { status, headers: { "content-type": "application/x-ndjson" } });
}

const request = { prompt: "hi", model: "qwen-plus", apiKey: "k" };
const noSleep = vi.fn(async () => {});

afterEach(() => {
  vi.unstubAllGlobals();
  noSleep.mockClear();
});

describe("streamGenerate", () => {
  it("accumulates deltas and finishes with metrics", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      ndjson([
        { type: "delta", text: "Hel" },
        { type: "delta", text: "lo" },
        { type: "done", metrics: { ttftMs: 5, totalMs: 9 } },
      ])
    ));
    const updates: RunState[] = [];
    const final = await streamGenerate(request, { signal: new AbortController().signal, onUpdate: (s) => updates.push(s) });
    expect(final).toEqual({ status: "done", text: "Hello", metrics: { ttftMs: 5, totalMs: 9 } });
    expect(updates.map((u) => u.text)).toEqual(["Hel", "Hello", "Hello"]);
  });

  it("waits out a 429 using Retry-After, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Too many requests." }), { status: 429, headers: { "Retry-After": "7" } })
      )
      .mockResolvedValueOnce(ndjson([{ type: "done", metrics: { ttftMs: null, totalMs: 1 } }]));
    vi.stubGlobal("fetch", fetchMock);
    const updates: RunState[] = [];
    const final = await streamGenerate(request, {
      signal: new AbortController().signal,
      onUpdate: (s) => updates.push(s),
      sleep: noSleep,
    });
    expect(noSleep).toHaveBeenCalledWith(7000, expect.anything());
    expect(updates[0].waitingSec).toBe(7);
    expect(final.status).toBe("done");
    expect(final.waitingSec).toBeUndefined();
  });

  it("gives up after the retry budget and shows the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "Too many requests. Try again in 30s." }), { status: 429 })
    ));
    const final = await streamGenerate(request, { signal: new AbortController().signal, sleep: noSleep, maxRateLimitRetries: 2 });
    expect(noSleep).toHaveBeenCalledTimes(2);
    expect(final).toMatchObject({ status: "error", error: "Too many requests. Try again in 30s." });
  });

  it("reports provider errors from the stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "error", message: "Qwen rejected the API key." }])));
    const final = await streamGenerate(request, { signal: new AbortController().signal });
    expect(final).toMatchObject({ status: "error", error: "Qwen rejected the API key." });
  });

  it("marks a stream that ends without a result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "delta", text: "partial" }])));
    const final = await streamGenerate(request, { signal: new AbortController().signal });
    expect(final).toMatchObject({ status: "error", text: "partial", error: "Connection closed early." });
  });

  it("marks an aborted run as stopped", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    }));
    const final = await streamGenerate(request, { signal: controller.signal });
    expect(final.status).toBe("stopped");
  });
});
