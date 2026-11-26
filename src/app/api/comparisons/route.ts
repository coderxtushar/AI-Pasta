import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { findModel } from "@/app/library/models";
import { MAX_PROMPT_CHARS } from "@/app/library/limits";
import { createComparison } from "@/server/comparisons";
import { enforceRateLimit } from "@/server/rateLimit";

const RequestSchema = z.object({
  prompt: z
    .string()
    .max(MAX_PROMPT_CHARS, `\`prompt\` must be at most ${MAX_PROMPT_CHARS} characters.`)
    .refine((p) => p.trim().length > 0, "`prompt` must not be empty."),
  models: z
    .array(z.string().refine((id) => findModel(id) !== undefined, "Unknown model."))
    .min(1, "Pick at least one model.")
    .max(20),
});

/** Creates a history entry; each model's response is saved by /api/generate. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to save comparisons." }, { status: 401 });
  const limited = await enforceRateLimit(req, "comparisons", userId);
  if (limited) return limited;

  const json = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const id = await createComparison(userId, parsed.data.prompt, [...new Set(parsed.data.models)]);
  return NextResponse.json({ id }, { status: 201 });
}
