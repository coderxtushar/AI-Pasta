"use client";
import React, { useState } from "react";
import { findModel } from "../library/models";
import { DEFAULT_RUBRIC, MAX_RUBRIC_CHARS, verdictSummary, type JudgeVerdict } from "../library/judge";

type Props = {
  prompt: string;
  /** Finished answers in display order. */
  answers: { modelId: string; text: string }[];
  /** Models the user has a key for, so they can act as the judge. */
  judgeOptions: string[];
  /** Browser key for a provider, or undefined to use the account's saved key. */
  apiKeyFor: (modelId: string) => string | undefined;
  /** Saved comparison to judge (the server reads its answers and saves the verdict). */
  comparisonId: string | null;
  /** The name the user currently sees for a model ("Model A" in blind mode). */
  displayName: (modelId: string) => string;
  verdict: JudgeVerdict | null;
  onVerdict: (verdict: JudgeVerdict) => void;
};

const button: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};

/** Asks one model to score the other models' answers against a rubric. */
export default function JudgePanel({
  prompt,
  answers,
  judgeOptions,
  apiKeyFor,
  comparisonId,
  displayName,
  verdict,
  onVerdict,
}: Props) {
  const [judgeModel, setJudgeModel] = useState(judgeOptions[0] ?? "");
  const [rubric, setRubric] = useState(DEFAULT_RUBRIC);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = judgeOptions.includes(judgeModel) ? judgeModel : judgeOptions[0];
  if (!selected) return null;
  const selfJudging = answers.some((a) => a.modelId === selected);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judgeModel: selected,
          apiKey: apiKeyFor(selected),
          rubric: rubric.trim() === DEFAULT_RUBRIC ? undefined : rubric,
          ...(comparisonId ? { comparisonId } : { prompt, answers }),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.verdict) throw new Error(data?.error ?? `Server error ${res.status}`);
      onVerdict(data.verdict);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const v = verdict ? verdictSummary(verdict, displayName) : null;

  return (
    <section
      aria-label="AI judge"
      style={{ marginTop: 12, padding: 12, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fafafa" }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
        <strong>AI judge</strong>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          Judge model
          <select
            value={selected}
            onChange={(e) => setJudgeModel(e.target.value)}
            style={{ padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
          >
            {judgeOptions.map((id) => (
              <option key={id} value={id}>
                {findModel(id)?.label ?? id}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={run} disabled={busy} style={button}>
          {busy ? "Judging…" : verdict ? "Judge again" : "Judge answers"}
        </button>
      </div>

      <details style={{ marginTop: 8, fontSize: 13 }}>
        <summary style={{ cursor: "pointer" }}>Rubric</summary>
        <textarea
          aria-label="Rubric"
          rows={3}
          maxLength={MAX_RUBRIC_CHARS}
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
          style={{ width: "100%", marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #d1d5db", fontFamily: "inherit" }}
        />
      </details>

      {selfJudging && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#b45309" }}>
          This judge also wrote one of the answers, so it may favor its own.
        </div>
      )}
      {error && (
        <div role="alert" style={{ marginTop: 6, fontSize: 13, color: "#b91c1c" }}>
          {error}
        </div>
      )}
      {v && verdict && (
        <div role="status" style={{ marginTop: 8, fontSize: 14 }}>
          <div>
            <strong>{v.judge}</strong> {v.pick}. {v.summary}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {(verdict.metrics.totalMs / 1000).toFixed(2)}s
            {verdict.metrics.inputTokens !== undefined &&
              ` · ${verdict.metrics.inputTokens} in / ${verdict.metrics.outputTokens} out tokens`}
            {` · ${verdict.metrics.costUsd !== undefined ? `$${verdict.metrics.costUsd.toFixed(5)}` : "cost —"}`}
          </div>
        </div>
      )}
    </section>
  );
}
