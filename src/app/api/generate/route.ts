import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { MAX_PROMPT_CHARS } from "@/app/library/limits";
import { estimateCostUsd, findModel } from "@/app/library/models";
import type { GenerateMetrics, StreamEvent } from "@/app/library/stream";
import { PROVIDERS } from "@/app/library/providers";
import { getDecryptedApiKey, isKeyStorageEnabled, KeyDecryptionError } from "@/server/apiKeys";
import { getOwnedComparison, saveResponse, type ResponseInput } from "@/server/comparisons";
import { getLanguageModel } from "@/server/llm";
import { describeProviderError } from "@/server/providerErrors";
import { enforceRateLimit } from "@/server/rateLimit";

// The client opens one request per model, so each model gets its own time budget.
export const maxDuration = 60;

const TIMEOUT_MS = 55_000;
// Reasoning models spend part of this budget thinking, so keep it generous.
const MAX_OUTPUT_TOKENS = 4096;

const RequestSchema = z.object({
  prompt: z
    .string({ required_error: "`prompt` is required." })
    .max(MAX_PROMPT_CHARS, `\`prompt\` must be at most ${MAX_PROMPT_CHARS} characters.`)
    .refine((p) => p.trim().length > 0, "`prompt` must not be empty."),
  model: z
    .string({ required_error: "`model` is required." })
    .refine((id) => findModel(id) !== undefined, "Unknown model."),
  /** Browser-held key. Omit it to use the key saved to the signed-in account. */
  apiKey: z.string().trim().min(1, "`apiKey` must not be empty.").optional(),
  /** When set, the final response is saved to this comparison (owner only). */
  comparisonId: z.string().optional(),
});

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: NextRequest) {
  // Keyed by IP: checking the session first would add a DB query to every call.
  const limited = await enforceRateLimit(req, "generate");
  if (limited) return limited;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { prompt, comparisonId } = parsed.data;
  const model = findModel(parsed.data.model)!;
  const needsUser = Boolean(comparisonId) || !parsed.data.apiKey;
  const userId = needsUser ? await currentUserId() : null;

  let apiKey = parsed.data.apiKey;
  if (!apiKey) {
    const label = PROVIDERS[model.provider].label;
    if (!userId || !isKeyStorageEnabled()) {
      return NextResponse.json({ error: "`apiKey` is required." }, { status: 400 });
    }
    try {
      apiKey = (await getDecryptedApiKey(userId, model.provider)) ?? undefined;
    } catch (e) {
      if (!(e instanceof KeyDecryptionError)) throw e;
      return NextResponse.json(
        { error: `Your saved ${label} key can't be read anymore. Please save it again.` },
        { status: 409 }
      );
    }
    if (!apiKey) {
      return NextResponse.json({ error: `No ${label} API key saved to your account.` }, { status: 400 });
    }
  }

  // Only the owner can save into a comparison, and only for its prompt and models.
  if (comparisonId) {
    const comparison = userId ? await getOwnedComparison(userId, comparisonId) : null;
    if (!comparison || !comparison.models.includes(model.id)) {
      return NextResponse.json({ error: "Comparison not found." }, { status: 404 });
    }
    if (comparison.prompt !== prompt) {
      return NextResponse.json({ error: "Prompt does not match the comparison." }, { status: 400 });
    }
  }

  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  // Aborts when the client disconnects (e.g. presses Stop) or the timeout fires.
  const abortSignal = AbortSignal.any([req.signal, timeout]);

  const result = streamText({
    model: getLanguageModel(model, apiKey),
    prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // Retries 429/5xx/network errors with exponential backoff (2s, 4s). The
    // abort signal still caps the total time at TIMEOUT_MS.
    maxRetries: 2,
    abortSignal,
    // Errors are forwarded to the client below; don't log prompts to the server console.
    onError: () => {},
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // Client already disconnected.
        }
      };

      let text = "";
      let ttftMs: number | null = null;
      let outcome: ResponseInput | null = null;
      const baseMetrics = (): GenerateMetrics => ({ ttftMs, totalMs: elapsed() });
      const fail = (message: string, status: "error" | "stopped" = "error") => {
        if (outcome) return;
        const metrics = baseMetrics();
        outcome = { status, text, error: message, ...metrics };
        send({ type: "error", message, metrics });
      };
      const onAbort = () =>
        timeout.aborted ? fail(`Timed out after ${TIMEOUT_MS / 1000}s.`) : fail("Stopped.", "stopped");

      try {
        for await (const part of result.fullStream) {
          if (outcome) break;
          switch (part.type) {
            case "text-delta":
              if (ttftMs === null) ttftMs = elapsed();
              text += part.text;
              send({ type: "delta", text: part.text });
              break;
            case "finish": {
              const { inputTokens, outputTokens, reasoningTokens } = part.totalUsage;
              const metrics: GenerateMetrics = {
                ...baseMetrics(),
                inputTokens,
                outputTokens,
                reasoningTokens,
                costUsd: estimateCostUsd(model, inputTokens, outputTokens),
                finishReason: part.finishReason,
              };
              outcome = { status: "done", text, ...metrics };
              send({ type: "done", metrics });
              break;
            }
            case "error":
              fail(describeProviderError(part.error, model.provider, model.id, apiKey));
              break;
            case "abort":
              onAbort();
              break;
          }
        }
      } catch (e) {
        if (abortSignal.aborted) onAbort();
        else fail(describeProviderError(e, model.provider, model.id, apiKey));
      } finally {
        fail("Stream ended without a result.");
        if (comparisonId && outcome) {
          // Runs even if the client pressed Stop, so partial output is kept.
          await saveResponse(comparisonId, model.id, outcome).catch((e) =>
            console.error("Saving response failed:", errorMessage(e))
          );
        }
        try {
          controller.close();
        } catch {
          // Already closed by a client disconnect.
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
