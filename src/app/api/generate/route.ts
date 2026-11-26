import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { z } from "zod";
import { estimateCostUsd, findModel } from "@/app/library/models";
import type { GenerateMetrics, StreamEvent } from "@/app/library/stream";
import { getLanguageModel } from "@/server/llm";

// The client opens one request per model, so each model gets its own time budget.
export const maxDuration = 60;

const TIMEOUT_MS = 55_000;
const MAX_PROMPT_CHARS = 20_000;
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
  apiKey: z
    .string({ required_error: "`apiKey` is required." })
    .trim()
    .min(1, "`apiKey` must not be empty."),
});

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: NextRequest) {
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

  const { prompt, apiKey } = parsed.data;
  const model = findModel(parsed.data.model)!;

  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  // Aborts when the client disconnects (e.g. presses Stop) or the timeout fires.
  const abortSignal = AbortSignal.any([req.signal, timeout]);

  const result = streamText({
    model: getLanguageModel(model, apiKey),
    prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 0,
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

      let ttftMs: number | null = null;
      let finished = false;
      const baseMetrics = (): GenerateMetrics => ({ ttftMs, totalMs: elapsed() });
      const fail = (message: string) => {
        if (finished) return;
        finished = true;
        send({ type: "error", message, metrics: baseMetrics() });
      };

      try {
        for await (const part of result.fullStream) {
          if (finished) break;
          switch (part.type) {
            case "text-delta":
              if (ttftMs === null) ttftMs = elapsed();
              send({ type: "delta", text: part.text });
              break;
            case "finish": {
              const { inputTokens, outputTokens, reasoningTokens } = part.totalUsage;
              finished = true;
              send({
                type: "done",
                metrics: {
                  ...baseMetrics(),
                  inputTokens,
                  outputTokens,
                  reasoningTokens,
                  costUsd: estimateCostUsd(model, inputTokens, outputTokens),
                  finishReason: part.finishReason,
                },
              });
              break;
            }
            case "error":
              fail(errorMessage(part.error));
              break;
            case "abort":
              fail(timeout.aborted ? `Timed out after ${TIMEOUT_MS / 1000}s.` : "Stopped.");
              break;
          }
        }
      } catch (e) {
        fail(timeout.aborted ? `Timed out after ${TIMEOUT_MS / 1000}s.` : errorMessage(e));
      } finally {
        fail("Stream ended without a result.");
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
