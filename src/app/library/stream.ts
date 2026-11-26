// Wire format for /api/generate: one JSON event per line (NDJSON).

export type GenerateMetrics = {
  /** Time from request start to the first text token, in ms. Null if no text arrived. */
  ttftMs: number | null;
  totalMs: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  finishReason?: string;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; metrics: GenerateMetrics }
  | { type: "error"; message: string; metrics?: GenerateMetrics };

export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as T;
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer) as T;
}
