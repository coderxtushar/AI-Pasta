import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { enforceRateLimit } from "@/server/rateLimit";
import { castVote } from "@/server/votes";

const VoteSchema = z.object({
  /** The winning model's ID, or null for a tie. */
  winner: z.string().nullable(),
});

const ERRORS = {
  "not-found": { status: 404, error: "Comparison not found." },
  "not-blind": { status: 400, error: "Only blind comparisons can be voted on." },
  "already-voted": { status: 409, error: "You've already voted on this comparison." },
  "invalid-winner": { status: 400, error: "The winner must be a model that answered." },
} as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to save votes." }, { status: 401 });
  const limited = await enforceRateLimit(req, "comparisons", userId);
  if (limited) return limited;

  const parsed = VoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "`winner` must be a model ID or null." }, { status: 400 });

  const result = await castVote(userId, (await params).id, parsed.data.winner);
  if (result === "ok") return NextResponse.json({ ok: true }, { status: 201 });
  const { status, error } = ERRORS[result];
  return NextResponse.json({ error }, { status });
}
