import { NextRequest, NextResponse } from "next/server";
import { streamText, type CallWarning } from "ai";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { MAX_PROMPT_CHARS } from "@/app/library/limits";
import { estimateCostUsd, findModel } from "@/app/library/models";
import type { GenerateMetrics, StreamEvent } from "@/app/library/stream";
import { resolveApiKey } from "@/server/resolveKey";
import { getOwnedComparison, saveResponse, type ResponseInput } from "@/server/comparisons";
import { MAX_TURNS, normalizeMessages, userTurns, type ChatMessage } from "@/app/library/conversation";
import { getLanguageModel } from "@/server/llm";
import { describeProviderError } from "@/server/providerErrors";
import { safeErrorMessage } from "@/app/library/redact";
import { enforceRateLimit } from "@/server/rateLimit";
import { GenerationSettingsSchema } from "@/server/settingsSchema";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  cleanSettings,
  effectiveSettings,
  type GenerationSettings,
} from "@/app/library/settings";

// The client opens one request per model, so each model gets its own time budget.
export const maxDuration = 60;

const TIMEOUT_MS = 55_000;

const MAX_MESSAGE_CHARS = 100_000;

const RequestSchema = z.object({
  /** A single prompt. Send either this or `messages`. */
  prompt: z.string().optional(),
  /** A conversation for multi-turn chat: this model's history, ending with the new user message. */
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(MAX_MESSAGE_CHARS, `Messages must be at most ${MAX_MESSAGE_CHARS} characters.`),
      })
    )
    .max(MAX_TURNS * 2, `A conversation can have at most ${MAX_TURNS} turns.`)
    .optional(),
  model: z
    .string({ required_error: "`model` is required." })
    .refine((id) => findModel(id) !== undefined, "Unknown model."),
  /** Browser-held key. Omit it to use the key saved to the signed-in account. */
  apiKey: z.string().trim().min(1, "`apiKey` must not be empty.").optional(),
  /** When set, the final response is saved to this comparison (owner only). */
  comparisonId: z.string().optional(),
  /** This model's effective settings. Ignored with comparisonId (the saved ones win). */
  settings: GenerationSettingsSchema.optional(),
});

const SETTING_NAMES: Record<string, string> = {
  temperature: "Temperature",
  topP: "Top-p",
  maxOutputTokens: "Max tokens",
};

/** Turns provider warnings (e.g. a setting the model ignores) into short notes for the user. */
function describeWarning(w: CallWarning): string | null {
  if (w.type === "unsupported-setting") {
    const setting = String(w.setting);
    const name = SETTING_NAMES[setting] ?? setting;
    if (!w.details) return `${name} isn't supported by this model and was ignored.`;
    const details = w.details.replace(new RegExp(`^${setting}\\b`), name);
    return details.charAt(0).toUpperCase() + details.slice(1);
  }
  if (w.type === "other") return w.message;
  return null;
}

/**
 * One JSON line per model call, for log search and dashboards (e.g. Vercel logs).
 * Deliberately excludes the prompt, the output, the API key and the user.
 */
function logGeneration(
  provider: string,
  model: string,
  keySource: "browser" | "account",
  saved: boolean,
  turn: number,
  o: ResponseInput
) {
  console.log(
    JSON.stringify({
      event: "generate",
      provider,
      model,
      keySource,
      saved,
      turn,
      status: o.status,
      ttftMs: o.ttftMs,
      totalMs: o.totalMs,
      inputTokens: o.inputTokens,
      outputTokens: o.outputTokens,
      costUsd: o.costUsd,
      error: o.status === "error" ? o.error : undefined,
    })
  );
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

  const { comparisonId } = parsed.data;
  if ((parsed.data.prompt === undefined) === (parsed.data.messages === undefined)) {
    return NextResponse.json({ error: "Send either `prompt` or `messages`." }, { status: 400 });
  }
  const messages: ChatMessage[] = parsed.data.messages ?? [{ role: "user", content: parsed.data.prompt! }];
  const last = messages.at(-1);
  if (!last || last.role !== "user" || !last.content.trim()) {
    return NextResponse.json({ error: "`prompt` must not be empty." }, { status: 400 });
  }
  if (last.content.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `\`prompt\` must be at most ${MAX_PROMPT_CHARS} characters.` },
      { status: 400 }
    );
  }
  const askedTurns = messages.filter((m) => m.role === "user").map((m) => m.content);
  const turn = askedTurns.length - 1;
  if (turn >= MAX_TURNS) {
    return NextResponse.json({ error: `A conversation can have at most ${MAX_TURNS} turns.` }, { status: 400 });
  }
  const model = findModel(parsed.data.model)!;
  const needsUser = Boolean(comparisonId) || !parsed.data.apiKey;
  const userId = needsUser ? await currentUserId() : null;

  const key = await resolveApiKey(parsed.data.apiKey, userId, model.provider);
  if ("error" in key) return NextResponse.json({ error: key.error }, { status: key.status });
  const { apiKey, source: keySource } = key;

  let settings: GenerationSettings = cleanSettings(parsed.data.settings);

  // Only the owner can save into a comparison, and only for its models and the
  // user messages saved so far (the first prompt, then each follow-up).
  if (comparisonId) {
    const comparison = userId ? await getOwnedComparison(userId, comparisonId) : null;
    if (!comparison || !comparison.models.includes(model.id)) {
      return NextResponse.json({ error: "Comparison not found." }, { status: 404 });
    }
    const saved = userTurns(comparison);
    if (askedTurns.length > saved.length || askedTurns.some((content, i) => content !== saved[i])) {
      return NextResponse.json({ error: "The conversation doesn't match the saved comparison." }, { status: 400 });
    }
    // The saved settings are what the history page shows, so they're what runs.
    settings = effectiveSettings(comparison.settings, model.id);
  }

  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  // Aborts when the client disconnects (e.g. presses Stop) or the timeout fires.
  const abortSignal = AbortSignal.any([req.signal, timeout]);

  const result = streamText({
    model: getLanguageModel(model, apiKey),
    system: settings.systemPrompt,
    messages: normalizeMessages(messages),
    temperature: settings.temperature,
    topP: settings.topP,
    maxOutputTokens: settings.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
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
      const notes = new Set<string>();
      const baseMetrics = (): GenerateMetrics => ({
        ttftMs,
        totalMs: elapsed(),
        ...(notes.size ? { notes: [...notes] } : {}),
      });
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
            case "start-step":
              for (const w of part.warnings) {
                const note = describeWarning(w);
                if (note) notes.add(note);
              }
              break;
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
          await saveResponse(comparisonId, model.id, turn, outcome).catch((e) =>
            console.error("Saving response failed:", safeErrorMessage(e))
          );
        }
        if (outcome) logGeneration(model.provider, model.id, keySource, Boolean(comparisonId), turn, outcome);
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
