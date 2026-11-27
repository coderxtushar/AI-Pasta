import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { findModel } from "@/app/library/models";
import { MAX_PROMPT_CHARS } from "@/app/library/limits";
import { createComparison } from "@/server/comparisons";
import { enforceRateLimit } from "@/server/rateLimit";
import { ComparisonSettingsSchema } from "@/server/settingsSchema";
import { compactSettings, isEmpty } from "@/app/library/settings";

const RequestSchema = z.object({
  prompt: z
    .string()
    .max(MAX_PROMPT_CHARS, `\`prompt\` must be at most ${MAX_PROMPT_CHARS} characters.`)
    .refine((p) => p.trim().length > 0, "`prompt` must not be empty."),
  models: z
    .array(z.string().refine((id) => findModel(id) !== undefined, "Unknown model."))
    .min(1, "Pick at least one model.")
    .max(20),
  settings: ComparisonSettingsSchema.optional(),
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

  const models = [...new Set(parsed.data.models)];
  const settings = parsed.data.settings ? compactSettings(parsed.data.settings, models) : null;
  const hasSettings = settings && (!isEmpty(settings.all) || Object.keys(settings.perModel).length > 0);
  const id = await createComparison(userId, parsed.data.prompt, models, hasSettings ? settings : null);
  return NextResponse.json({ id }, { status: 201 });
}
