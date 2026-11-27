// Browser side of /api/generate: one streamed answer from one model.
import { readNdjson, type GenerateMetrics, type StreamEvent } from "./stream";
import type { GenerationSettings } from "./settings";
import type { ChatMessage } from "./conversation";

export type RunState = {
  status: "streaming" | "done" | "error" | "stopped";
  text: string;
  error?: string;
  metrics?: GenerateMetrics;
  /** Seconds until a retry after the server said "too many requests". */
  waitingSec?: number;
};

export type GenerateRequest = {
  /** A single prompt; or send `messages` for a multi-turn conversation. */
  prompt?: string;
  messages?: ChatMessage[];
  model: string;
  /** Browser-held key; omit to use the key saved to the signed-in account. */
  apiKey?: string;
  comparisonId?: string;
  settings?: GenerationSettings;
};

type Options = {
  signal: AbortSignal;
  /** Called with the full state after every change. */
  onUpdate?: (state: RunState) => void;
  /** How many times to wait out a 429 before giving up. */
  maxRateLimitRetries?: number;
  /** Injectable for tests. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/** Streams one model's answer, reporting each change. Never throws; returns the final state. */
export async function streamGenerate(request: GenerateRequest, options: Options): Promise<RunState> {
  const { signal, onUpdate, maxRateLimitRetries = 3, sleep = abortableSleep } = options;
  let state: RunState = { status: "streaming", text: "" };
  const set = (next: RunState) => {
    state = next;
    onUpdate?.(state);
  };

  try {
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
      if (res.status !== 429 || attempt >= maxRateLimitRetries) break;
      const waitSec = Math.min(Math.max(Number(res.headers.get("Retry-After")) || 5, 1), 60);
      set({ ...state, waitingSec: waitSec });
      await sleep(waitSec * 1000, signal);
      set({ ...state, waitingSec: undefined });
    }
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? `Server error ${res.status}`);
    }

    for await (const event of readNdjson<StreamEvent>(res.body)) {
      if (event.type === "delta") set({ ...state, text: state.text + event.text });
      else if (event.type === "done") set({ ...state, status: "done", metrics: event.metrics });
      else set({ ...state, status: "error", error: event.message, metrics: event.metrics });
    }
    // Stream closed without a final event (e.g. connection dropped).
    if (state.status === "streaming") set({ ...state, status: "error", error: "Connection closed early." });
  } catch (err) {
    if (signal.aborted) {
      if (state.status === "streaming") set({ ...state, status: "stopped", waitingSec: undefined });
    } else {
      set({ ...state, status: "error", error: err instanceof Error ? err.message : "Unknown error" });
    }
  }
  return state;
}
