"use client";
import React from "react";
import type { GenerateMetrics } from "../library/stream";
import type { RunState } from "../library/generateClient";

export type { RunState };

type ModelProps = {
  label: string;
  state: RunState;
  /** Smaller text next to the label, e.g. "was Model B" after a blind reveal. */
  subtitle?: string;
  /** Short highlight, e.g. "Your pick". */
  badge?: string;
  /**
   * Blind mode before the vote: hide everything that could identify the model
   * (latency, tokens, cost, provider notes and provider-specific errors).
   */
  anonymous?: boolean;
  /** Extra content under the answer (vote button, judge verdict). */
  footer?: React.ReactNode;
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

const Model: React.FC<ModelProps> = ({ label, state, subtitle, badge, anonymous, footer }) => {
  const status =
    state.status === "streaming" && state.waitingSec
      ? { text: `Rate limited, retrying in ${state.waitingSec}s…`, color: "#b45309" }
      : STATUS_STYLE[state.status];
  return (
    <section aria-label={label} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ margin: 0 }}>
          {label}
          {subtitle && <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: "#6b7280" }}>{subtitle}</span>}
        </h3>
        <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          {badge && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#166534",
                background: "#dcfce7",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              {badge}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: status.color }}>{status.text}</span>
        </span>
      </div>

      {state.text && <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{state.text}</pre>}

      {state.status === "error" && state.error && (
        <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>
          {anonymous ? "This model's answer failed. Details appear after you vote." : `Error: ${state.error}`}
        </div>
      )}

      {!anonymous && state.metrics && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>{formatMetrics(state.metrics)}</div>
      )}
      {!anonymous &&
        state.metrics?.notes?.map((note) => (
        <div key={note} style={{ marginTop: 4, fontSize: 12, color: "#b45309" }}>
          Note: {note}
        </div>
      ))}
      {footer}
    </section>
  );
};

export default Model;
