import { NextRequest, NextResponse } from "next/server";
import { NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { MAX_PROMPT_CHARS } from "@/app/library/limits";
import { DEFAULT_RUBRIC, MAX_RUBRIC_CHARS, type JudgeVerdict } from "@/app/library/judge";
import { safeErrorMessage } from "@/app/library/redact";
import { findModel } from "@/app/library/models";
import { getFinishedAnswers, getOwnedComparison, saveJudgement } from "@/server/comparisons";
import { JudgeOutputError, runJudge } from "@/server/judge";
import { describeProviderError } from "@/server/providerErrors";
import { enforceRateLimit } from "@/server/rateLimit";
import { resolveApiKey } from "@/server/resolveKey";

export const maxDuration = 60;

const TIMEOUT_MS = 55_000;
const MAX_ANSWER_CHARS = 100_000;

const knownModel = z.string().refine((id) => findModel(id) !== undefined, "Unknown model.");

const RequestSchema = z.object({
  judgeModel: knownModel,
  /** Browser-held key for the judge's provider. Omit to use the account's saved key. */
  apiKey: z.string().trim().min(1).optional(),
  rubric: z.string().trim().max(MAX_RUBRIC_CHARS, `Rubric must be at most ${MAX_RUBRIC_CHARS} characters.`).optional(),
  /** Judge a saved comparison: prompt and answers are read from the database, and the verdict is saved. */
  comparisonId: z.string().optional(),
  /** Otherwise the caller supplies them. */
  prompt: z.string().max(MAX_PROMPT_CHARS).optional(),
  answers: z
    .array(z.object({ modelId: knownModel, text: z.string().max(MAX_ANSWER_CHARS) }))
    .max(20)
    .optional(),
});

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "generate");
  if (limited) return limited;

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid request.");
  const { comparisonId } = parsed.data;
  const judge = findModel(parsed.data.judgeModel)!;
  const rubric = parsed.data.rubric || DEFAULT_RUBRIC;

  const userId = comparisonId || !parsed.data.apiKey ? await currentUserId() : null;
  const key = await resolveApiKey(parsed.data.apiKey, userId, judge.provider);
  if ("error" in key) return bad(key.error, key.status);

  let prompt: string;
  let answers: { modelId: string; text: string }[];
  if (comparisonId) {
    const comparison = userId ? await getOwnedComparison(userId, comparisonId) : null;
    if (!comparison) return bad("Comparison not found.", 404);
    prompt = comparison.prompt;
    answers = await getFinishedAnswers(comparisonId);
  } else {
    if (!parsed.data.prompt?.trim()) return bad("`prompt` is required without `comparisonId`.");
    prompt = parsed.data.prompt;
    const seen = new Set<string>();
    answers = (parsed.data.answers ?? []).filter(
      (a) => a.text.trim() && !seen.has(a.modelId) && seen.add(a.modelId)
    );
  }
  if (answers.length < 2) return bad("Need at least two finished answers to judge.");

  const abortSignal = AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]);
  let verdict: JudgeVerdict;
  try {
    verdict = await runJudge({ judge, apiKey: key.apiKey, prompt, rubric, answers, abortSignal });
  } catch (e) {
    if (e instanceof JudgeOutputError) return bad(e.message, 502);
    if (NoObjectGeneratedError.isInstance(e)) {
      return bad(`${judge.label} didn't return a valid verdict. Try again or pick another judge.`, 502);
    }
    if (abortSignal.aborted) return bad(`The judge timed out after ${TIMEOUT_MS / 1000}s.`, 504);
    return bad(describeProviderError(e, judge.provider, judge.id, key.apiKey), 502);
  }

  // A failed save shouldn't throw away a verdict the user already paid for.
  let saved = false;
  if (comparisonId) {
    try {
      await saveJudgement(comparisonId, verdict);
      saved = true;
    } catch (e) {
      console.error("Saving judgement failed:", safeErrorMessage(e));
    }
  }
  console.log(
    JSON.stringify({
      event: "judge",
      judge: judge.id,
      answers: answers.length,
      saved,
      totalMs: verdict.metrics?.totalMs,
      inputTokens: verdict.metrics?.inputTokens,
      outputTokens: verdict.metrics?.outputTokens,
      costUsd: verdict.metrics?.costUsd,
    })
  );
  return NextResponse.json({ verdict, saved });
}
