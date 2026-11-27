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

const MAX_BATCH_INPUTS = 50;

type Props = {
  signedIn: boolean;
  /** Keys saved to the account (hints only); null means keys live in this browser. */
  accountKeys: SavedKeyInfo[] | null;
};

const cellKey = (inputIndex: number, modelId: string) => `${inputIndex}:${modelId}`;

const box: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 6,
  border: "1px solid #ddd",
  fontFamily: "inherit",
  fontWeight: 400,
  marginTop: 6,
};

const button = (primary: boolean): React.CSSProperties => ({
  padding: "10px 16px",
  borderRadius: 8,
  border: primary ? "none" : "1px solid #d1d5db",
  background: primary ? "#2563eb" : "#fff",
  color: primary ? "#fff" : "#111827",
  cursor: "pointer",
  fontWeight: 600,
});

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
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Batch run</h1>
      <p style={{ marginTop: 0, color: "#6b7280", fontSize: 14 }}>
        Run one prompt template over many inputs and models, then export the results as CSV.
      </p>

      {modelsWithKeys.length === 0 && (
        <div role="status" style={{ padding: 10, borderRadius: 8, background: "#fff7ed", fontSize: 14, marginBottom: 12 }}>
          No API keys found. Add them on the <Link href="/" style={{ color: "#2563eb" }}>Compare</Link> page first.
        </div>
      )}

      <div style={{ padding: 16, borderRadius: 8, border: "1px solid #e6e6e6", background: "#fff" }}>
        <label style={{ display: "block", fontWeight: 600 }}>
          Prompt template
          <textarea
            id="batch-template"
            rows={4}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="e.g. Summarize this review in one sentence: {{input}}"
            style={box}
          />
        </label>
        <TemplatePicker signedIn={signedIn} prompt={template} onLoad={setTemplate} />
        {template.trim() && !hasInputSlot(template) && (
          <div style={{ fontSize: 13, color: "#b45309", marginTop: 4 }}>
            No <code>{"{{input}}"}</code> in the template, so each input is sent as the whole prompt.
          </div>
        )}

        <label style={{ display: "block", fontWeight: 600, marginTop: 14 }}>
          Inputs
          <textarea
            id="batch-inputs"
            rows={6}
            value={rawInputs}
            onChange={(e) => setRawInputs(e.target.value)}
            placeholder={"One input per line.\nFor multi-line inputs, separate them with a line containing only ---"}
            style={box}
          />
        </label>
        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          {inputs.length} input(s) × {orderedSelection.length} model(s) = {inputs.length * orderedSelection.length} answers
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600 }}>Models</div>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10 }}>
            {MODELS.map((m) => (
              <label key={m.id} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={() =>
                    setSelected((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]))
                  }
                />
                {m.label}
                {!hasKey(m.provider) && <span style={{ color: "#9ca3af" }}>(no key)</span>}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <SettingsPanel
            value={settings}
            onChange={(next) => {
              setSettings(next);
              storeSettings(next);
            }}
            modelIds={orderedSelection}
          />
        </div>

        {signedIn && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 8 }}>
            <input type="checkbox" checked={saveToHistory} onChange={(e) => setSaveToHistory(e.target.checked)} />
            Save each prompt to my history
          </label>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={run} disabled={running || problem !== null} style={button(true)}>
            {running ? "Running…" : "Run batch"}
          </button>
          {running && (
            <button type="button" onClick={() => abortRef.current?.abort()} style={button(false)}>
              Stop
            </button>
          )}
          {!running && total > 0 && (
            <button type="button" onClick={exportCsv} style={button(false)}>
              Export CSV
            </button>
          )}
          {problem && !running && <span style={{ fontSize: 13, color: "#6b7280" }}>{problem}</span>}
          {total > 0 && (
            <span role="status" style={{ fontSize: 14 }}>
              {finished} / {total} done
            </span>
          )}
        </div>
        {notice && <div style={{ marginTop: 8, fontSize: 13, color: "#b45309" }}>{notice}</div>}
      </div>

      {total > 0 && (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <table aria-label="Batch results" style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={th}>Input</th>
                {runModels.map((id) => (
                  <th key={id} style={th}>
                    {findModel(id)?.label ?? id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runInputs.map((input, i) => (
                <tr key={i}>
                  <td style={td}>
                    <div style={{ whiteSpace: "pre-wrap", maxWidth: 260 }}>{input}</div>
                    {comparisonIds[i] && (
                      <Link href={`/c/${comparisonIds[i]}`} style={{ color: "#2563eb", fontSize: 12 }}>
                        Saved
                      </Link>
                    )}
                  </td>
                  {runModels.map((id) => (
                    <td key={id} style={td}>
                      <ResultCell state={results[cellKey(i, id)]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: 8, borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" };
const td: React.CSSProperties = { verticalAlign: "top", padding: 8, borderBottom: "1px solid #e5e7eb", minWidth: 180 };

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
    <div>
      {status && <div style={{ color: state.status === "error" ? "#b91c1c" : "#6b7280" }}>{status}</div>}
      {state.text &&
        (state.text.length > PREVIEW_CHARS ? (
          <details>
            <summary style={{ cursor: "pointer", whiteSpace: "pre-wrap" }}>
              {state.text.slice(0, PREVIEW_CHARS)}…
            </summary>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{state.text}</div>
          </details>
        ) : (
          <div style={{ whiteSpace: "pre-wrap" }}>{state.text}</div>
        ))}
      {m && state.status === "done" && (
        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
          {(m.totalMs / 1000).toFixed(2)}s
          {m.outputTokens !== undefined && ` · ${m.outputTokens} tok`}
          {m.costUsd !== undefined && ` · $${m.costUsd.toFixed(5)}`}
        </div>
      )}
    </div>
  );
}
