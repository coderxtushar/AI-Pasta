import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { MAX_TURNS } from "@/app/library/conversation";
import { MAX_PROMPT_CHARS } from "@/app/library/limits";
import { appendFollowUp } from "@/server/comparisons";
import { enforceRateLimit } from "@/server/rateLimit";

const FollowUpSchema = z.object({
  /** 1 for the first follow-up, 2 for the next, … */
  turn: z.number().int().min(1),
  content: z
    .string()
    .max(MAX_PROMPT_CHARS, `Messages must be at most ${MAX_PROMPT_CHARS} characters.`)
    .refine((c) => c.trim().length > 0, "The message is empty."),
});

const ERRORS = {
  "not-found": { status: 404, error: "Comparison not found." },
  "out-of-order": { status: 409, error: "This conversation changed elsewhere. Reload to continue." },
  "too-many": { status: 400, error: `A conversation can have at most ${MAX_TURNS} turns.` },
} as const;

/** Saves a follow-up message; each model's answer is then saved by /api/generate. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to save conversations." }, { status: 401 });
  const limited = await enforceRateLimit(req, "comparisons", userId);
  if (limited) return limited;

  const parsed = FollowUpSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const result = await appendFollowUp(userId, (await params).id, parsed.data.turn, parsed.data.content);
  if (result === "ok") return NextResponse.json({ turn: parsed.data.turn }, { status: 201 });
  const { status, error } = ERRORS[result];
  return NextResponse.json({ error }, { status });
}
