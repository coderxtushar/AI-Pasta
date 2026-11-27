"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SettingsPanel from "./SettingsPanel";
import TemplatePicker from "./TemplatePicker";
import { MODELS, findModel } from "../library/models";
import { PROVIDERS, type ApiKeys, type ProviderId, type SavedKeyInfo } from "../library/providers";
import { loadKeys } from "../library/keys";
import { streamGenerate, type RunState } from "../library/generateClient";
import { EMPTY_SETTINGS, compactSettings, effectiveSettings, settingsError, type ComparisonSettings } from "../library/settings";
import { loadStoredSettings, storeSettings } from "../library/settingsStorage";
import { fillTemplate, hasInputSlot, parseInputs } from "../library/templates";
import { RESULT_COLUMNS, downloadCsv, resultRow, toCsv } from "../library/csv";
import { MAX_PROMPT_CHARS } from "../library/limits";
import { modelColor } from "../library/modelColors";
import { Download, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, PageShell } from "@/components/site/page-header";
import { cn } from "@/lib/utils";

const MAX_BATCH_INPUTS = 50;

type Props = {
  signedIn: boolean;
  /** Keys saved to the account (hints only); null means keys live in this browser. */
  accountKeys: SavedKeyInfo[] | null;
};

const cellKey = (inputIndex: number, modelId: string) => `${inputIndex}:${modelId}`;

/**
 * Runs a prompt template against a list of inputs and several models. Inputs go
 * one at a time, with that input's models in parallel, which keeps the request
 * rate reasonable; rate-limited calls wait and retry (see streamGenerate).
 */
export default function BatchRunner({ signedIn, accountKeys }: Props) {
  const [template, setTemplate] = useState("");
  const [rawInputs, setRawInputs] = useState("");
  const [keys, setKeys] = useState<ApiKeys>({});
  const [settings, setSettings] = useState<ComparisonSettings>(EMPTY_SETTINGS);
  const [selected, setSelected] = useState<string[]>([]);
  const [saveToHistory, setSaveToHistory] = useState(true);

  const [running, setRunning] = useState(false);
  const [runInputs, setRunInputs] = useState<string[]>([]);
  const [runModels, setRunModels] = useState<string[]>([]);
  const [runTemplate, setRunTemplate] = useState("");
  const [results, setResults] = useState<Record<string, RunState>>({});
  const [comparisonIds, setComparisonIds] = useState<(string | null)[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const accountMode = accountKeys !== null;
  const hasKey = (provider: ProviderId) =>
    accountMode ? accountKeys.some((k) => k.provider === provider) : Boolean(keys[provider]);
  const modelsWithKeys = MODELS.filter((m) => hasKey(m.provider)).map((m) => m.id);

  useEffect(() => {
    const browserKeys = loadKeys();
    setKeys(browserKeys);
    const stored = loadStoredSettings();
    if (stored) setSettings(stored);
    // Default to every model the user can actually call.
    setSelected(
      MODELS.filter((m) =>
        accountKeys ? accountKeys.some((k) => k.provider === m.provider) : Boolean(browserKeys[m.provider])
      ).map((m) => m.id)
    );
    return () => abortRef.current?.abort();
  }, [accountKeys]);

  const inputs = parseInputs(rawInputs);
  const orderedSelection = MODELS.map((m) => m.id).filter((id) => selected.includes(id));
  const prompts = inputs.map((input) => fillTemplate(template, input));
  const tooLong = prompts.findIndex((p) => p.length > MAX_PROMPT_CHARS);
  const settingsInvalid = [settings.all, ...orderedSelection.map((id) => settings.perModel[id] ?? {})].some(
    (s) => settingsError(s) !== null
  );
  const problem =
    inputs.length === 0
      ? "Add at least one input."
      : inputs.length > MAX_BATCH_INPUTS
        ? `A batch can have at most ${MAX_BATCH_INPUTS} inputs.`
        : orderedSelection.length === 0
          ? "Pick at least one model."
          : tooLong >= 0
            ? `Input ${tooLong + 1} makes a prompt longer than ${MAX_PROMPT_CHARS} characters.`
            : settingsInvalid
              ? "Fix the generation settings first."
              : null;

  const total = runInputs.length * runModels.length;
  const finished = Object.values(results).filter((r) => r.status !== "streaming").length;

  async function createComparison(prompt: string, models: string[], signal: AbortSignal): Promise<string | null> {
    try {
      const res = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, models, settings: compactSettings(settings, models) }),
        signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.id !== "string") throw new Error(data?.error ?? `Server error ${res.status}`);
      return data.id;
    } catch (err) {
      if (!signal.aborted) setNotice(`Some prompts weren't saved to history: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  async function run() {
    if (problem) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const models = orderedSelection;
    const batchInputs = inputs;

    setRunInputs(batchInputs);
    setRunModels(models);
    setRunTemplate(template);
    setNotice(null);
    setComparisonIds(batchInputs.map(() => null));
    setResults(
      Object.fromEntries(
        batchInputs.flatMap((_, i) => models.map((id) => [cellKey(i, id), { status: "streaming", text: "" } as RunState]))
      )
    );
    setRunning(true);

    const setCell = (i: number, modelId: string, state: RunState) =>
      setResults((prev) => ({ ...prev, [cellKey(i, modelId)]: state }));

    for (let i = 0; i < batchInputs.length; i++) {
      if (controller.signal.aborted) break;
      const prompt = fillTemplate(template, batchInputs[i]);
      const callable = models.filter((id) => hasKey(findModel(id)!.provider));
      const comparisonId =
        signedIn && saveToHistory && callable.length ? await createComparison(prompt, callable, controller.signal) : null;
      setComparisonIds((prev) => prev.map((c, j) => (j === i ? comparisonId : c)));

      await Promise.all(
        models.map(async (modelId) => {
          const model = findModel(modelId)!;
          if (!hasKey(model.provider)) {
            const label = PROVIDERS[model.provider].label;
            setCell(i, modelId, { status: "error", text: "", error: `No ${label} key saved.` });
            return;
          }
          await streamGenerate(
            {
              prompt,
              model: modelId,
              apiKey: accountMode ? undefined : keys[model.provider],
              comparisonId: comparisonId ?? undefined,
              settings: effectiveSettings(settings, modelId),
            },
            { signal: controller.signal, onUpdate: (state) => setCell(i, modelId, state) }
          );
        })
      );
    }

    // Anything that never started (after Stop) is marked as stopped.
    setResults((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, v]) => [k, v.status === "streaming" ? { ...v, status: "stopped" as const } : v])
      )
    );
    setRunning(false);
  }

  function exportCsv() {
    const rows = runInputs.flatMap((input, i) =>
      runModels.map((modelId) =>
        resultRow({
          prompt: fillTemplate(runTemplate, input),
          input,
          modelId,
          state: results[cellKey(i, modelId)],
          settings: effectiveSettings(settings, modelId),
        })
      )
    );
    downloadCsv(`ai-pasta-batch-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`, toCsv(RESULT_COLUMNS, rows));
  }

  return (
    <PageShell wide>
      <PageHeader
        title="Batch run"
        description="Run one prompt template over many inputs and models, then export every answer as CSV."
      >
        {running && (
          <Button type="button" variant="secondary" onClick={() => abortRef.current?.abort()}>
            <Square className="size-3.5 fill-current" /> Stop
          </Button>
        )}
        {!running && total > 0 && (
          <Button type="button" variant="ghost" onClick={exportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
        )}
        <Button type="button" onClick={run} disabled={running || problem !== null}>
          {running ? "Running…" : "Run batch"}
        </Button>
      </PageHeader>

      {modelsWithKeys.length === 0 && (
        <div role="status" className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          No API keys found. Add them on the{" "}
          <Link href="/app" className="underline">
            Compare
          </Link>{" "}
          page first.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Template" className="rounded-xl border bg-card">
          <div className="grid gap-1.5 p-4">
            <Label htmlFor="batch-template">Prompt template</Label>
            <Textarea
              id="batch-template"
              rows={5}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="e.g. Summarize this review in one sentence: {{input}}"
              className="font-normal"
            />
            {template.trim() && !hasInputSlot(template) && (
              <p className="text-xs text-warning">
                No <code className="font-mono">{"{{input}}"}</code> in the template, so each input is sent as the whole
                prompt.
              </p>
            )}
          </div>
          <div className="border-t px-4 py-2.5">
            <TemplatePicker signedIn={signedIn} prompt={template} onLoad={setTemplate} />
          </div>
        </section>

        <section aria-label="Inputs" className="rounded-xl border bg-card p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="batch-inputs">Inputs</Label>
            <Textarea
              id="batch-inputs"
              rows={7}
              value={rawInputs}
              onChange={(e) => setRawInputs(e.target.value)}
              placeholder={"One input per line.\nFor multi-line inputs, separate them with a line containing only ---"}
              className="font-normal"
            />
            <p className="text-xs text-muted-foreground tabular">
              {inputs.length} input(s) × {orderedSelection.length} model(s) = {inputs.length * orderedSelection.length} answers
            </p>
          </div>
        </section>
      </div>

      <section aria-label="Run options" className="mt-4 rounded-xl border bg-card">
        <fieldset className="flex flex-wrap items-center gap-1.5 p-3">
          <legend className="sr-only">Models</legend>
          {MODELS.map((m) => {
            const checked = selected.includes(m.id);
            return (
              <label
                key={m.id}
                className={cn(
                  "relative inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-[13px] transition-colors select-none",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  checked ? "border-foreground/20 bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <input
                  type="checkbox"
                  className="absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-full opacity-0"
                  checked={checked}
                  onChange={() =>
                    setSelected((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]))
                  }
                />
                <span aria-hidden className={cn("size-2 rounded-full", !checked && "opacity-40")} style={{ background: modelColor(m.id) }} />
                {m.label}
                {!hasKey(m.provider) && <span className="text-[11px] text-muted-foreground/70">(no key)</span>}
              </label>
            );
          })}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2 border-t px-2 py-1.5">
          <SettingsPanel
            value={settings}
            onChange={(next) => {
              setSettings(next);
              storeSettings(next);
            }}
            modelIds={orderedSelection}
            className="max-w-[60%]"
          />
          {signedIn && (
            <div className="flex items-center gap-2 px-2">
              <Checkbox id="save-history" checked={saveToHistory} onCheckedChange={(v) => setSaveToHistory(v === true)} />
              <Label htmlFor="save-history" className="cursor-pointer text-[13px] font-normal text-muted-foreground">
                Save each prompt to my history
              </Label>
            </div>
          )}
          <div className="ml-auto flex items-center gap-3 px-2 text-sm">
            {problem && !running && <span className="text-xs text-muted-foreground">{problem}</span>}
            {total > 0 && (
              <span role="status" className="tabular">
                {finished} / {total} done
              </span>
            )}
          </div>
        </div>
      </section>
      {notice && <p className="mt-2 text-sm text-warning">{notice}</p>}

      {total > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
          <table aria-label="Batch results" className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b bg-subtle text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Input</th>
                {runModels.map((id) => (
                  <th key={id} className="px-3 py-2 font-medium whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="size-2 rounded-full" style={{ background: modelColor(id) }} />
                      {findModel(id)?.label ?? id}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {runInputs.map((input, i) => (
                <tr key={i} className="align-top">
                  <td className="w-56 min-w-44 px-3 py-2.5">
                    <div className="whitespace-pre-wrap">{input}</div>
                    {comparisonIds[i] && (
                      <Link href={`/c/${comparisonIds[i]}`} className="text-xs text-muted-foreground underline">
                        Saved
                      </Link>
                    )}
                  </td>
                  {runModels.map((id) => (
                    <td key={id} className="min-w-56 px-3 py-2.5">
                      <ResultCell state={results[cellKey(i, id)]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

const PREVIEW_CHARS = 160;

function ResultCell({ state }: { state: RunState | undefined }) {
  if (!state) return null;
  const m = state.metrics;
  const status =
    state.status === "streaming"
      ? state.waitingSec
        ? `Rate limited, retrying in ${state.waitingSec}s…`
        : "Running…"
      : state.status === "done"
        ? null
        : state.status === "stopped"
          ? "Stopped"
          : `Error: ${state.error}`;
  return (
    <div className="grid gap-1">
      {status && <div className={state.status === "error" ? "text-danger" : "text-muted-foreground"}>{status}</div>}
      {state.text &&
        (state.text.length > PREVIEW_CHARS ? (
          <details>
            <summary className="cursor-pointer whitespace-pre-wrap">{state.text.slice(0, PREVIEW_CHARS)}…</summary>
            <div className="mt-1 whitespace-pre-wrap">{state.text}</div>
          </details>
        ) : (
          <div className="whitespace-pre-wrap">{state.text}</div>
        ))}
      {m && state.status === "done" && (
        <div className="font-mono text-[11.5px] text-muted-foreground tabular">
          {(m.totalMs / 1000).toFixed(2)}s
          {m.outputTokens !== undefined && ` · ${m.outputTokens} tok`}
          {m.costUsd !== undefined && ` · $${m.costUsd.toFixed(5)}`}
        </div>
      )}
    </div>
  );
}
