import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { findModel, type ModelInfo } from "@/app/library/models";
import { PROVIDERS, type ApiKeys } from "@/app/library/providers";

// Models run in parallel, so the slowest single call bounds the request.
export const maxDuration = 60;

const MAX_PROMPT_CHARS = 20_000;
const MAX_OUTPUT_TOKENS = 1024;
const TIMEOUT_MS = 55_000;

type CompareResult = { model: string; text?: string; error?: string };

async function callModel(model: ModelInfo, prompt: string, apiKey: string): Promise<string> {
  if (model.provider === "anthropic") {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
    const res = await client.messages.create({
      model: model.id,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    let text = "";
    for (const block of res.content) {
      if (block.type === "text") text += block.text;
    }
    return text;
  }

  // Every other provider exposes an OpenAI-compatible chat completions API.
  const client = new OpenAI({
    apiKey,
    baseURL: PROVIDERS[model.provider].baseURL,
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  });
  const res = await client.chat.completions.create({
    model: model.id,
    messages: [{ role: "user", content: prompt }],
  });
  return res.choices[0]?.message?.content ?? "";
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON.");
  }

  const { prompt, models, keys } = (body ?? {}) as Record<string, unknown>;

  if (typeof prompt !== "string" || !prompt.trim()) {
    return badRequest("`prompt` must be a non-empty string.");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return badRequest(`\`prompt\` must be at most ${MAX_PROMPT_CHARS} characters.`);
  }
  if (!Array.isArray(models) || models.length === 0 || !models.every((m) => typeof m === "string")) {
    return badRequest("`models` must be a non-empty array of model IDs.");
  }
  if (typeof keys !== "object" || keys === null) {
    return badRequest("`keys` must be an object.");
  }

  const apiKeys = keys as ApiKeys;

  const results = await Promise.all(
    [...new Set(models as string[])].map(async (id): Promise<CompareResult> => {
      const model = findModel(id);
      if (!model) return { model: id, error: `Unknown model "${id}".` };

      const apiKey = apiKeys[model.provider];
      if (typeof apiKey !== "string" || !apiKey.trim()) {
        return { model: id, error: `No ${PROVIDERS[model.provider].label} API key saved.` };
      }

      try {
        return { model: id, text: await callModel(model, prompt, apiKey.trim()) };
      } catch (e) {
        return { model: id, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  return NextResponse.json({ results });
}
