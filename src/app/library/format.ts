import type { GenerateMetrics } from "./stream";

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

/** "0.31s first · 0.58s · 12/5 tok · $0.00012": one line for tight previews. */
export function formatMetricsCompact(m: GenerateMetrics): string {
  const parts: string[] = [];
  if (m.ttftMs !== null) parts.push(`${seconds(m.ttftMs)} first`);
  parts.push(seconds(m.totalMs));
  if (m.inputTokens !== undefined && m.outputTokens !== undefined) parts.push(`${m.inputTokens}/${m.outputTokens} tok`);
  parts.push(m.costUsd !== undefined ? `$${m.costUsd.toFixed(5)}` : "cost —");
  return parts.join(" · ");
}

/** "first token 0.31s · total 0.58s · 12 in / 5 out tokens · $0.00012" (client- and server-safe). */
export function formatMetrics(m: GenerateMetrics): string {
  const parts: string[] = [];
  if (m.ttftMs !== null) parts.push(`first token ${seconds(m.ttftMs)}`);
  parts.push(`total ${seconds(m.totalMs)}`);
  if (m.inputTokens !== undefined && m.outputTokens !== undefined) {
    const reasoning = m.reasoningTokens ? `, ${m.reasoningTokens} reasoning` : "";
    parts.push(`${m.inputTokens} in / ${m.outputTokens} out tokens${reasoning}`);
  }
  parts.push(m.costUsd !== undefined ? `$${m.costUsd.toFixed(5)}` : "cost —");
  if (m.finishReason === "length") parts.push("hit output token limit");
  return parts.join(" · ");
}
