import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { JudgeVerdict } from "@/app/library/judge";

vi.mock("@/auth", () => ({ currentUserId: vi.fn() }));
vi.mock("@/server/rateLimit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/server/resolveKey", () => ({ resolveApiKey: vi.fn() }));
vi.mock("@/server/comparisons", () => ({
  getOwnedComparison: vi.fn(),
  getFinishedAnswers: vi.fn(),
  saveJudgement: vi.fn(),
}));
vi.mock("@/server/judge", () => {
  class JudgeOutputError extends Error {}
  return { runJudge: vi.fn(), JudgeOutputError };
});

const { currentUserId } = await import("@/auth");
const { enforceRateLimit } = await import("@/server/rateLimit");
const { resolveApiKey } = await import("@/server/resolveKey");
const { getOwnedComparison, getFinishedAnswers, saveJudgement } = await import("@/server/comparisons");
const { runJudge, JudgeOutputError } = await import("@/server/judge");
const { POST } = await import("./route");

const verdict = { judgeModelId: "gpt-5.4-mini" } as JudgeVerdict;
const answers = [
  { modelId: "qwen-plus", text: "a" },
  { modelId: "deepseek-chat", text: "b" },
];

function post(body: unknown) {
  return new NextRequest("http://localhost/api/judge", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(currentUserId).mockResolvedValue(null);
  vi.mocked(resolveApiKey).mockResolvedValue({ apiKey: "k", source: "browser" });
  vi.mocked(runJudge).mockResolvedValue(verdict);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("POST /api/judge", () => {
  it("judges answers sent by the browser, with the default rubric", async () => {
    const res = await POST(post({ judgeModel: "gpt-5.4-mini", apiKey: "k", prompt: "Q?", answers }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verdict, saved: false });
    expect(runJudge).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Q?", answers, rubric: expect.stringContaining("Score each answer") })
    );
    expect(saveJudgement).not.toHaveBeenCalled();
  });

  it("needs at least two non-empty, distinct answers", async () => {
    const res = await POST(
      post({
        judgeModel: "gpt-5.4-mini",
        apiKey: "k",
        prompt: "Q?",
        answers: [answers[0], { ...answers[0] }, { modelId: "deepseek-chat", text: "  " }],
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Need at least two finished answers to judge.");
  });

  it("rejects unknown models", async () => {
    const res = await POST(post({ judgeModel: "nope", prompt: "Q?", answers }));
    expect(res.status).toBe(400);
  });

  it("reads saved answers from the database and saves the verdict", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u1");
    vi.mocked(getOwnedComparison).mockResolvedValue({ id: "c1", prompt: "Saved prompt" } as never);
    vi.mocked(getFinishedAnswers).mockResolvedValue(answers);
    const res = await POST(
      post({ judgeModel: "gpt-5.4-mini", comparisonId: "c1", prompt: "ignored", answers: [answers[0]] })
    );
    expect(res.status).toBe(200);
    expect(runJudge).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Saved prompt", answers }));
    expect(saveJudgement).toHaveBeenCalledWith("c1", verdict);
  });

  it("still returns the verdict if saving it fails", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u1");
    vi.mocked(getOwnedComparison).mockResolvedValue({ id: "c1", prompt: "p" } as never);
    vi.mocked(getFinishedAnswers).mockResolvedValue(answers);
    vi.mocked(saveJudgement).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(post({ judgeModel: "gpt-5.4-mini", comparisonId: "c1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verdict, saved: false });
  });

  it("refuses someone else's comparison", async () => {
    vi.mocked(currentUserId).mockResolvedValue("u2");
    vi.mocked(getOwnedComparison).mockResolvedValue(null);
    const res = await POST(post({ judgeModel: "gpt-5.4-mini", comparisonId: "c1" }));
    expect(res.status).toBe(404);
  });

  it("explains an unusable verdict", async () => {
    vi.mocked(runJudge).mockRejectedValue(new JudgeOutputError("The judge didn't score every answer."));
    const res = await POST(post({ judgeModel: "gpt-5.4-mini", apiKey: "k", prompt: "Q?", answers }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("didn't score every answer");
  });
});
