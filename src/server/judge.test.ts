import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV2 } from "ai/test";

vi.mock("./llm", () => ({ getLanguageModel: vi.fn() }));

const { getLanguageModel } = await import("./llm");
const { runJudge, JudgeOutputError } = await import("./judge");
const { findModel } = await import("@/app/library/models");

function judgeReplying(json: unknown) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV2({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return {
        content: [{ type: "text", text: JSON.stringify(json) }],
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        warnings: [],
      };
    },
  });
  vi.mocked(getLanguageModel).mockReturnValue(model);
  return prompts;
}

const answers = [
  { modelId: "qwen-plus", text: "First answer text" },
  { modelId: "deepseek-chat", text: "Second answer text" },
];
// random() = 0 → shuffle([qwen, deepseek]) = [deepseek, qwen], so A = deepseek, B = qwen.
const base = { judge: findModel("gpt-5.4-mini")!, apiKey: "k", prompt: "Q?", rubric: "R", answers, random: () => 0 };

describe("runJudge", () => {
  it("maps the judge's letters back to models", async () => {
    const prompts = judgeReplying({
      scores: [
        { id: "A", score: 9, reasoning: "Answer A is precise." },
        { id: "b", score: 6.4, reasoning: "Vague." },
      ],
      winner: "A",
      summary: "Answer A wins.",
    });
    const v = await runJudge(base);
    expect(v.labels).toEqual({ A: "deepseek-chat", B: "qwen-plus" });
    expect(v.scores).toEqual({
      "deepseek-chat": { score: 9, reasoning: "Answer A is precise." },
      "qwen-plus": { score: 6, reasoning: "Vague." },
    });
    expect(v.winnerModelId).toBe("deepseek-chat");
    // The judge sees only letters, never model names.
    expect(prompts[0]).not.toMatch(/qwen|deepseek/i);
    // gpt-5.4-mini pricing: $0.75 in / $4.50 out per 1M tokens.
    expect(v.metrics.costUsd).toBeCloseTo((100 * 0.75 + 50 * 4.5) / 1e6, 10);
  });

  it("supports ties", async () => {
    judgeReplying({
      scores: [
        { id: "A", score: 7, reasoning: "ok" },
        { id: "B", score: 7, reasoning: "ok" },
      ],
      winner: "tie",
      summary: "Even.",
    });
    expect((await runJudge(base)).winnerModelId).toBeNull();
  });

  it("fails clearly when an answer wasn't scored", async () => {
    judgeReplying({ scores: [{ id: "A", score: 7, reasoning: "ok" }], winner: "A", summary: "x" });
    await expect(runJudge(base)).rejects.toBeInstanceOf(JudgeOutputError);
  });
});
