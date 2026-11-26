"use client";
import React from "react";
import type { GenerateMetrics } from "../library/stream";

export type RunState = {
  status: "streaming" | "done" | "error" | "stopped";
  text: string;
  error?: string;
  metrics?: GenerateMetrics;
};

type ModelProps = {
  label: string;
  state: RunState;
};

const STATUS_STYLE: Record<RunState["status"], { text: string; color: string }> = {
  streaming: { text: "Streaming…", color: "#2563eb" },
  done: { text: "Done", color: "#16a34a" },
  error: { text: "Error", color: "#b91c1c" },
  stopped: { text: "Stopped", color: "#6b7280" },
};

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatMetrics(m: GenerateMetrics): string {
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

const Model: React.FC<ModelProps> = ({ label, state }) => {
  const status = STATUS_STYLE[state.status];
  return (
    <section aria-label={label} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ margin: 0 }}>{label}</h3>
        <span style={{ fontSize: 12, fontWeight: 600, color: status.color }}>{status.text}</span>
      </div>

      {state.text && <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{state.text}</pre>}

      {state.status === "error" && state.error && (
        <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>Error: {state.error}</div>
      )}

      {state.metrics && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>{formatMetrics(state.metrics)}</div>
      )}
    </section>
  );
};

export default Model;
