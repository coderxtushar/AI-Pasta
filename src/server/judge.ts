import { generateObject } from "ai";
import { z } from "zod";
import { shuffle } from "@/app/library/blind";
import { buildJudgePrompt, judgeLetter, type JudgeVerdict } from "@/app/library/judge";
import { estimateCostUsd, type ModelInfo } from "@/app/library/models";
import { getLanguageModel } from "./llm";

const VerdictSchema = z.object({
  scores: z
    .array(
      z.object({
        id: z.string(),
        score: z.number().min(1).max(10),
        reasoning: z.string(),
      })
    )
    .min(1),
  winner: z.string(),
  summary: z.string(),
});

export type JudgeInput = {
  judge: ModelInfo;
  apiKey: string;
  prompt: string;
  rubric: string;
  answers: { modelId: string; text: string }[];
  abortSignal?: AbortSignal;
  /** Injectable for tests; shuffles the answers so position can't bias the judge. */
  random?: () => number;
};

export class JudgeOutputError extends Error {}

export async function runJudge(input: JudgeInput): Promise<JudgeVerdict> {
  const startedAt = performance.now();
  const order = shuffle(input.answers, input.random);
  const labels: Record<string, string> = {};
  order.forEach((a, i) => (labels[judgeLetter(i)] = a.modelId));

  const { object, usage } = await generateObject({
    model: getLanguageModel(input.judge, input.apiKey),
    schema: VerdictSchema,
    prompt: buildJudgePrompt(
      input.prompt,
      order.map((a, i) => ({ letter: judgeLetter(i), text: a.text })),
      input.rubric
    ),
    maxRetries: 2,
    abortSignal: input.abortSignal,
  });

  const scores: JudgeVerdict["scores"] = {};
  for (const s of object.scores) {
    const modelId = labels[s.id.trim().toUpperCase()];
    if (modelId && !scores[modelId]) scores[modelId] = { score: Math.round(s.score), reasoning: s.reasoning };
  }
  const missing = order.filter((a) => !scores[a.modelId]);
  if (missing.length) throw new JudgeOutputError("The judge didn't score every answer. Try again or pick another judge.");

  const winner = object.winner.trim().toUpperCase();
  return {
    judgeModelId: input.judge.id,
    rubric: input.rubric,
    scores,
    winnerModelId: winner === "TIE" ? null : labels[winner] ?? null,
    summary: object.summary,
    labels,
    metrics: {
      totalMs: Math.round(performance.now() - startedAt),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: estimateCostUsd(input.judge, usage.inputTokens, usage.outputTokens),
    },
  };
}
