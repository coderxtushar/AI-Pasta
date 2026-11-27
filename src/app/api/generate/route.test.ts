import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError, simulateReadableStream } from "ai";
import { MockLanguageModelV2 } from "ai/test";
import type { LanguageModelV2CallWarning, LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { NextRequest } from "next/server";
import { readNdjson, type StreamEvent } from "@/app/library/stream";

vi.mock("@/auth", () => ({ currentUserId: vi.fn() }));
vi.mock("@/server/llm", () => ({ getLanguageModel: vi.fn() }));
vi.mock("@/server/rateLimit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/server/comparisons", () => ({ getOwnedComparison: vi.fn(), saveResponse: vi.fn() }));
vi.mock("@/server/apiKeys", () => {
  class KeyDecryptionError extends Error {}
  return { getDecryptedApiKey: vi.fn(), isKeyStorageEnabled: vi.fn(), KeyDecryptionError };
});

const { currentUserId } = await import("@/auth");
const { getLanguageModel } = await import("@/server/llm");
const { getOwnedComparison, saveResponse } = await import("@/server/comparisons");
const { getDecryptedApiKey, isKeyStorageEnabled, KeyDecryptionError } = await import("@/server/apiKeys");
const { enforceRateLimit } = await import("@/server/rateLimit");
const { POST } = await import("./route");

function textModel(parts: string[], warnings: LanguageModelV2CallWarning[] = []) {
  const chunks: LanguageModelV2StreamPart[] = [
    // Real providers report warnings (e.g. an ignored setting) in this first part.
    { type: "stream-start", warnings },
    { type: "text-start", id: "t" },
    ...parts.map((delta): LanguageModelV2StreamPart => ({ type: "text-delta", id: "t", delta })),
    { type: "text-end", id: "t" },
    { type: "finish", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } },
  ];
  return new MockLanguageModelV2({ doStream: async () => ({ stream: simulateReadableStream({ chunks }) }) });
}

function failingModel(error: Error) {
  return new MockLanguageModelV2({
    doStream: async () => {
      throw error;
    },
  });
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function events(res: Response) {
  const out: StreamEvent[] = [];
  for await (const e of readNdjson<StreamEvent>(res.body!)) out.push(e);
  return out;
}

const base = { prompt: "hi", model: "gpt-5.4-mini", apiKey: "sk-browser" };

beforeEach(() => {
  vi.mocked(currentUserId).mockResolvedValue(null);
  vi.mocked(isKeyStorageEnabled).mockReturnValue(true);
  vi.mocked(getLanguageModel).mockReturnValue(textModel(["Hel", "lo"]));
  vi.mocked(saveResponse).mockResolvedValue(undefined);
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("POST /api/generate: validation", () => {
  it("stops rate-limited callers before doing any work", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(enforceRateLimit).mockResolvedValue(NextResponse.json({ error: "Too many requests." }, { status: 429 }));
    const res = await POST(post(base));
    expect(res.status).toBe(429);
    expect(getLanguageModel).not.toHaveBeenCalled();
  });

  it.each([
    ["not json", "Request body must be JSON."],
    [{ ...base, prompt: "   " }, "`prompt` must not be empty."],
    [{ ...base, model: "nope" }, "Unknown model."],
    [{ ...base, prompt: "x".repeat(20_001) }, "at most 20000"],
  ])("rejects %j", async (body, message) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(message);
  });
});

describe("POST /api/generate: streaming", () => {
  it("streams deltas, then usage, latency and cost", async () => {
    const res = await POST(post(base));
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const out = await events(res);
    expect(out.filter((e) => e.type === "delta").map((e) => (e.type === "delta" ? e.text : ""))).toEqual([
      "Hel",
      "lo",
    ]);
    const done = out.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type !== "done") return;
    expect(done.metrics).toMatchObject({ inputTokens: 10, outputTokens: 20, finishReason: "stop" });
    expect(done.metrics.ttftMs).toBeGreaterThanOrEqual(0);
    // gpt-5.4-mini: $0.75 in / $4.50 out per 1M tokens.
    expect(done.metrics.costUsd).toBeCloseTo((10 * 0.75 + 20 * 4.5) / 1e6, 10);
  });

  it("logs one structured line without the prompt, output or key", async () => {
    await events(await POST(post({ ...base, prompt: "my secret prompt" })));
    const line = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).find((l) => l.includes('"event":"generate"'));
    expect(JSON.parse(line!)).toMatchObject({
      event: "generate",
      provider: "openai",
      model: "gpt-5.4-mini",
      keySource: "browser",
      status: "done",
      inputTokens: 10,
      outputTokens: 20,
    });
    expect(line).not.toContain("my secret prompt");
    expect(line).not.toContain("Hello");
    expect(line).not.toContain("sk-browser");
  });

  it("uses the browser key when one is sent", async () => {
    await events(await POST(post(base)));
    expect(getLanguageModel).toHaveBeenCalledWith(expect.objectContaining({ id: "gpt-5.4-mini" }), "sk-browser");
    expect(getDecryptedApiKey).not.toHaveBeenCalled();
  });

  it("explains a rejected key without leaking it", async () => {
    const err = new APICallError({
      message: "Incorrect API key provided: sk-browser",
      url: "https://api.openai.com",
      requestBodyValues: {},
      statusCode: 401,
      isRetryable: false,
    });
    vi.mocked(getLanguageModel).mockReturnValue(failingModel(err));
    const [event] = await events(await POST(post(base)));
    expect(event).toMatchObject({ type: "error", message: expect.stringContaining("OpenAI rejected the API key") });
    expect(JSON.stringify(event)).not.toContain("sk-browser");
  });

  it("retries a temporary provider outage", { timeout: 10_000 }, async () => {
    let calls = 0;
    const flaky = new MockLanguageModelV2({
      doStream: async (options) => {
        calls++;
        if (calls === 1) {
          throw new APICallError({
            message: "overloaded",
            url: "https://api.openai.com",
            requestBodyValues: {},
            statusCode: 503,
            isRetryable: true,
          });
        }
        return textModel(["ok"]).doStream(options);
      },
    });
    vi.mocked(getLanguageModel).mockReturnValue(flaky);
    const out = await events(await POST(post(base)));
    expect(calls).toBe(2);
    expect(out.at(-1)?.type).toBe("done");
  });

  it("turns a provider failure into an error event", async () => {
    vi.mocked(getLanguageModel).mockReturnValue(failingModel(new Error("boom")));
    const out = await events(await POST(post(base)));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "error" });
  });
});

describe("POST /api/generate: generation settings", () => {
  function spyModel(warnings: LanguageModelV2CallWarning[] = []) {
    const calls: Record<string, unknown>[] = [];
    const model = new MockLanguageModelV2({
      doStream: async (options) => {
        calls.push(options as unknown as Record<string, unknown>);
        return textModel(["ok"], warnings).doStream(options);
      },
    });
    return { model, calls };
  }

  it("passes the system prompt and sampling settings to the model", async () => {
    const { model, calls } = spyModel();
    vi.mocked(getLanguageModel).mockReturnValue(model);
    const settings = { systemPrompt: "Answer in French.", temperature: 0.3, topP: 0.8, maxOutputTokens: 256 };
    await events(await POST(post({ ...base, settings })));
    expect(calls[0]).toMatchObject({ temperature: 0.3, topP: 0.8, maxOutputTokens: 256 });
    expect(calls[0].prompt).toEqual([
      { role: "system", content: "Answer in French." },
      expect.objectContaining({ role: "user" }),
    ]);
  });

  it("uses provider defaults, and 4096 max tokens, when nothing is set", async () => {
    const { model, calls } = spyModel();
    vi.mocked(getLanguageModel).mockReturnValue(model);
    await events(await POST(post(base)));
    expect(calls[0]).toMatchObject({ temperature: undefined, topP: undefined, maxOutputTokens: 4096 });
    expect((calls[0].prompt as { role: string }[])[0].role).toBe("user");
  });

  it.each([
    [{ temperature: 2.5 }, "Temperature must be between 0 and 2."],
    [{ topP: -0.1 }, "Top-p must be between 0 and 1."],
    [{ maxOutputTokens: 10.5 }, "Max tokens must be a whole number."],
    [{ seed: 1 }, "Unrecognized key"],
  ])("rejects invalid settings %j", async (settings, message) => {
    const res = await POST(post({ ...base, settings }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(message);
  });

  it("reports settings the model ignored", async () => {
    const { model } = spyModel([
      { type: "unsupported-setting", setting: "temperature", details: "temperature is not supported for reasoning models" },
      { type: "unsupported-setting", setting: "topP" },
    ]);
    vi.mocked(getLanguageModel).mockReturnValue(model);
    const out = await events(await POST(post({ ...base, settings: { temperature: 0.5, topP: 0.5 } })));
    const done = out.at(-1);
    expect(done?.type === "done" && done.metrics.notes).toEqual([
      "Temperature is not supported for reasoning models",
      "Top-p isn't supported by this model and was ignored.",
    ]);
  });
});

describe("POST /api/generate: account keys", () => {
  const noKey = { prompt: "hi", model: "gpt-5.4-mini" };

  it("requires a key when signed out", async () => {
    const res = await POST(post(noKey));
    expect(res.status).toBe(400);
  });

  it("uses the decrypted account key when signed in", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u1");
    vi.mocked(getDecryptedApiKey).mockResolvedValue("sk-account");
    await events(await POST(post(noKey)));
    expect(getDecryptedApiKey).toHaveBeenCalledWith("u1", "openai");
    expect(getLanguageModel).toHaveBeenCalledWith(expect.anything(), "sk-account");
  });

  it("explains when no key is saved", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u1");
    vi.mocked(getDecryptedApiKey).mockResolvedValue(null);
    const res = await POST(post(noKey));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No OpenAI API key saved to your account.");
  });

  it("asks the user to re-save a key that can't be decrypted", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u1");
    vi.mocked(getDecryptedApiKey).mockRejectedValue(new KeyDecryptionError("bad"));
    const res = await POST(post(noKey));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("save it again");
  });
});

describe("POST /api/generate: saving to history", () => {
  const comparison = {
    id: "c1",
    userId: "u1",
    prompt: "hi",
    models: ["gpt-5.4-mini"],
    isPublic: false,
    settings: null,
    blind: false,
    createdAt: new Date(),
  };

  it("refuses a comparison the user doesn't own", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u2");
    vi.mocked(getOwnedComparison).mockResolvedValue(null);
    const res = await POST(post({ ...base, comparisonId: "c1" }));
    expect(res.status).toBe(404);
  });

  it("refuses a prompt that differs from the comparison", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u1");
    vi.mocked(getOwnedComparison).mockResolvedValue(comparison);
    const res = await POST(post({ ...base, prompt: "other", comparisonId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("saves the finished response", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u1");
    vi.mocked(getOwnedComparison).mockResolvedValue(comparison);
    await events(await POST(post({ ...base, comparisonId: "c1" })));
    expect(saveResponse).toHaveBeenCalledWith(
      "c1",
      "gpt-5.4-mini",
      expect.objectContaining({ status: "done", text: "Hello", inputTokens: 10, outputTokens: 20 })
    );
  });

  it("runs with the saved settings, not the request's", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u1");
    vi.mocked(getOwnedComparison).mockResolvedValue({
      ...comparison,
      settings: { all: { temperature: 0.1 }, perModel: { "gpt-5.4-mini": { maxOutputTokens: 500 } } },
    });
    const calls: Record<string, unknown>[] = [];
    vi.mocked(getLanguageModel).mockReturnValue(
      new MockLanguageModelV2({
        doStream: async (options) => {
          calls.push(options as unknown as Record<string, unknown>);
          return textModel(["ok"]).doStream(options);
        },
      })
    );
    await events(await POST(post({ ...base, comparisonId: "c1", settings: { temperature: 1.9 } })));
    expect(calls[0]).toMatchObject({ temperature: 0.1, maxOutputTokens: 500 });
  });

  it("saves failures too", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u1");
    vi.mocked(getOwnedComparison).mockResolvedValue(comparison);
    vi.mocked(getLanguageModel).mockReturnValue(failingModel(new Error("boom")));
    await events(await POST(post({ ...base, comparisonId: "c1" })));
    expect(saveResponse).toHaveBeenCalledWith("c1", "gpt-5.4-mini", expect.objectContaining({ status: "error" }));
  });
});
