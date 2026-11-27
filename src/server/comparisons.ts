import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "./db";
import { comparisons, judgements, responses, type ResponseStatus } from "./db/schema";
import type { JudgeVerdict } from "@/app/library/judge";
import type { ComparisonSettings } from "@/app/library/settings";
import { getVote } from "./votes";

export type Comparison = typeof comparisons.$inferSelect;
export type SavedResponse = typeof responses.$inferSelect;

export async function createComparison(
  userId: string,
  prompt: string,
  models: string[],
  options: { settings?: ComparisonSettings | null; blind?: boolean } = {}
) {
  const [row] = await db
    .insert(comparisons)
    .values({ userId, prompt, models, settings: options.settings ?? null, blind: options.blind ?? false })
    .returning({ id: comparisons.id });
  return row.id;
}

/** Returns the comparison only if `userId` owns it. */
export async function getOwnedComparison(userId: string, id: string): Promise<Comparison | null> {
  const [row] = await db
    .select()
    .from(comparisons)
    .where(and(eq(comparisons.id, id), eq(comparisons.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Owners always see their comparison; anyone else only if it's public. */
export async function getComparisonForViewer(id: string, viewerId: string | null) {
  if (!isUuid(id)) return null;
  const [comparison] = await db.select().from(comparisons).where(eq(comparisons.id, id)).limit(1);
  if (!comparison) return null;
  const isOwner = viewerId !== null && comparison.userId === viewerId;
  if (!isOwner && !comparison.isPublic) return null;

  const [rows, vote, verdicts] = await Promise.all([
    db.select().from(responses).where(eq(responses.comparisonId, id)),
    comparison.blind ? getVote(id) : Promise.resolve(null),
    listJudgements(id),
  ]);
  return { comparison, responses: rows, isOwner, vote, verdicts };
}

export async function listComparisons(userId: string, search?: string, limit = 50) {
  const filters = [eq(comparisons.userId, userId)];
  if (search?.trim()) filters.push(ilike(comparisons.prompt, `%${escapeLike(search.trim())}%`));
  return db
    .select()
    .from(comparisons)
    .where(and(...filters))
    .orderBy(desc(comparisons.createdAt))
    .limit(limit);
}

export async function deleteComparison(userId: string, id: string) {
  await db.delete(comparisons).where(and(eq(comparisons.id, id), eq(comparisons.userId, userId)));
}

export async function setComparisonPublic(userId: string, id: string, isPublic: boolean) {
  await db
    .update(comparisons)
    .set({ isPublic })
    .where(and(eq(comparisons.id, id), eq(comparisons.userId, userId)));
}

export type ResponseInput = {
  status: ResponseStatus;
  text: string;
  error?: string;
  ttftMs: number | null;
  totalMs: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  finishReason?: string;
  notes?: string[];
};

export async function saveResponse(comparisonId: string, modelId: string, r: ResponseInput) {
  const values = {
    status: r.status,
    text: r.text,
    error: r.error ?? null,
    ttftMs: r.ttftMs,
    totalMs: r.totalMs,
    inputTokens: r.inputTokens ?? null,
    outputTokens: r.outputTokens ?? null,
    reasoningTokens: r.reasoningTokens ?? null,
    costUsd: r.costUsd ?? null,
    finishReason: r.finishReason ?? null,
    notes: r.notes?.length ? r.notes : null,
  };
  await db
    .insert(responses)
    .values({ comparisonId, modelId, ...values })
    .onConflictDoUpdate({ target: [responses.comparisonId, responses.modelId], set: values });
}

/** Answers that finished, for judging. */
export async function getFinishedAnswers(comparisonId: string): Promise<{ modelId: string; text: string }[]> {
  const rows = await db
    .select({ modelId: responses.modelId, text: responses.text })
    .from(responses)
    .where(and(eq(responses.comparisonId, comparisonId), eq(responses.status, "done")));
  return rows.filter((r) => r.text.trim());
}

export async function saveJudgement(comparisonId: string, verdict: JudgeVerdict) {
  await db
    .insert(judgements)
    .values({ comparisonId, judgeModelId: verdict.judgeModelId, verdict })
    .onConflictDoUpdate({
      target: [judgements.comparisonId, judgements.judgeModelId],
      set: { verdict, createdAt: new Date() },
    });
}

export async function listJudgements(comparisonId: string): Promise<JudgeVerdict[]> {
  const rows = await db
    .select({ verdict: judgements.verdict })
    .from(judgements)
    .where(eq(judgements.comparisonId, comparisonId))
    .orderBy(judgements.createdAt);
  return rows.map((r) => r.verdict);
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string) {
  return UUID_RE.test(s);
}
