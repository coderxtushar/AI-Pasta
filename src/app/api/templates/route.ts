import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { MAX_PROMPT_CHARS } from "@/app/library/limits";
import { MAX_TEMPLATE_NAME } from "@/app/library/templates";
import { enforceRateLimit } from "@/server/rateLimit";
import { TemplateLimitError, deleteTemplate, listTemplates, saveTemplate } from "@/server/templates";

const SaveSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the template a name.")
    .max(MAX_TEMPLATE_NAME, `Template names can be at most ${MAX_TEMPLATE_NAME} characters.`),
  prompt: z
    .string()
    .max(MAX_PROMPT_CHARS, `Templates can be at most ${MAX_PROMPT_CHARS} characters.`)
    .refine((p) => p.trim().length > 0, "The template's prompt is empty."),
});

async function requireUser() {
  const userId = await currentUserId();
  return userId
    ? { userId }
    : { response: NextResponse.json({ error: "Sign in to save templates to your account." }, { status: 401 }) };
}

export async function GET() {
  const u = await requireUser();
  if ("response" in u) return u.response;
  return NextResponse.json({ templates: await listTemplates(u.userId) });
}

export async function PUT(req: NextRequest) {
  const u = await requireUser();
  if ("response" in u) return u.response;
  const limited = await enforceRateLimit(req, "templates", u.userId);
  if (limited) return limited;

  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid template." }, { status: 400 });
  }
  try {
    const template = await saveTemplate(u.userId, parsed.data.name, parsed.data.prompt);
    return NextResponse.json({ template });
  } catch (e) {
    if (e instanceof TemplateLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const u = await requireUser();
  if ("response" in u) return u.response;
  const limited = await enforceRateLimit(req, "templates", u.userId);
  if (limited) return limited;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "`id` is required." }, { status: 400 });
  await deleteTemplate(u.userId, id);
  return new NextResponse(null, { status: 204 });
}
