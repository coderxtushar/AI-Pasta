"use client";
import React, { useState } from "react";
import { findModel } from "../library/models";
import { ChevronRight, Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    <section aria-label="AI judge" className="rounded-xl border bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Scale className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">AI judge</h2>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Judge model
          <select
            value={selected}
            onChange={(e) => setJudgeModel(e.target.value)}
            className="h-8 rounded-md border bg-transparent px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {judgeOptions.map((id) => (
              <option key={id} value={id}>
                {findModel(id)?.label ?? id}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={run} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? "Judging…" : verdict ? "Judge again" : "Judge answers"}
        </Button>
      </div>

      <details className="group mt-2 text-xs text-muted-foreground">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
          Rubric
        </summary>
        <Textarea
          aria-label="Rubric"
          rows={3}
          maxLength={MAX_RUBRIC_CHARS}
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
          className="mt-2 text-sm text-foreground"
        />
      </details>

      {selfJudging && (
        <p className="mt-2 text-xs text-warning">This judge also wrote one of the answers, so it may favor its own.</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {v && verdict && (
        <div role="status" className="mt-3 border-t pt-3 text-sm">
          <p>
            <strong className="font-semibold">{v.judge}</strong> {v.pick}. {v.summary}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground tabular">
            {(verdict.metrics.totalMs / 1000).toFixed(2)}s
            {verdict.metrics.inputTokens !== undefined &&
              ` · ${verdict.metrics.inputTokens} in / ${verdict.metrics.outputTokens} out tokens`}
            {` · ${verdict.metrics.costUsd !== undefined ? `$${verdict.metrics.costUsd.toFixed(5)}` : "cost —"}`}
          </p>
        </div>
      )}
    </section>
  );
}
