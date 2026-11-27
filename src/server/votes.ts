import { and, eq, sql } from "drizzle-orm";
import type { LeaderboardRow } from "@/app/library/blind";
import { db } from "./db";
import { comparisons, responses, votes } from "./db/schema";

export type Vote = typeof votes.$inferSelect;

export type VoteResult = "ok" | "not-found" | "not-blind" | "already-voted" | "invalid-winner";

/**
 * Records the owner's pick for a blind comparison. `winnerModelId` null means a tie.
 * The winner must have actually answered, and each comparison gets one vote:
 * after the reveal, a second vote would no longer be blind.
 */
export async function castVote(
  userId: string,
  comparisonId: string,
  winnerModelId: string | null
): Promise<VoteResult> {
  const [comparison] = await db
    .select()
    .from(comparisons)
    .where(and(eq(comparisons.id, comparisonId), eq(comparisons.userId, userId)))
    .limit(1);
  if (!comparison) return "not-found";
  if (!comparison.blind) return "not-blind";

  if (winnerModelId !== null) {
    const [answered] = await db
      .select({ modelId: responses.modelId })
      .from(responses)
      .where(
        and(
          eq(responses.comparisonId, comparisonId),
          eq(responses.modelId, winnerModelId),
          eq(responses.status, "done")
        )
      )
      .limit(1);
    if (!answered) return "invalid-winner";
  }

  const inserted = await db
    .insert(votes)
    .values({ comparisonId, userId, winnerModelId })
    .onConflictDoNothing()
    .returning({ comparisonId: votes.comparisonId });
  return inserted.length ? "ok" : "already-voted";
}

export async function getVote(comparisonId: string): Promise<Vote | null> {
  const [row] = await db.select().from(votes).where(eq(votes.comparisonId, comparisonId)).limit(1);
  return row ?? null;
}

/** Per model: blind votes it answered in, how many it won, and ties. */
export async function getLeaderboard(userId: string): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      modelId: responses.modelId,
      appearances: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where ${votes.winnerModelId} = ${responses.modelId})::int`,
      ties: sql<number>`count(*) filter (where ${votes.winnerModelId} is null)::int`,
    })
    .from(votes)
    .innerJoin(
      responses,
      and(eq(responses.comparisonId, votes.comparisonId), eq(responses.status, "done"))
    )
    .where(eq(votes.userId, userId))
    .groupBy(responses.modelId);
  return rows;
}
