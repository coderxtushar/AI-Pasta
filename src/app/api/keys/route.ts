import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { PROVIDER_IDS, type ProviderId } from "@/app/library/providers";
import { deleteApiKey, isKeyStorageEnabled, listApiKeys, saveApiKey } from "@/server/apiKeys";

// Saved keys are write-only from the browser's point of view: these routes
// accept a key and return only its last 4 characters, never the key itself.

const ProviderSchema = z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]], {
  errorMap: () => ({ message: "Unknown provider." }),
});

const SaveSchema = z.object({
  provider: ProviderSchema,
  apiKey: z
    .string({ required_error: "`apiKey` is required." })
    .trim()
    .min(8, "That doesn't look like an API key.")
    .max(512, "That doesn't look like an API key."),
});

type Guard = { userId: string } | { response: NextResponse };

async function guard(): Promise<Guard> {
  if (!isKeyStorageEnabled()) {
    return { response: NextResponse.json({ error: "Account key storage is not enabled." }, { status: 404 }) };
  }
  const userId = await currentUserId();
  if (!userId) {
    return { response: NextResponse.json({ error: "Sign in to manage saved keys." }, { status: 401 }) };
  }
  return { userId };
}

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const g = await guard();
  if ("response" in g) return g.response;
  return NextResponse.json({ keys: await listApiKeys(g.userId) }, { headers: noStore });
}

export async function PUT(req: NextRequest) {
  const g = await guard();
  if ("response" in g) return g.response;
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const key = await saveApiKey(g.userId, parsed.data.provider, parsed.data.apiKey);
  return NextResponse.json({ key }, { headers: noStore });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("response" in g) return g.response;
  const parsed = ProviderSchema.safeParse(req.nextUrl.searchParams.get("provider"));
  if (!parsed.success) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  await deleteApiKey(g.userId, parsed.data);
  return new NextResponse(null, { status: 204 });
}
