"use client";
import React, { useEffect, useRef, useState } from "react";
import Model, { type RunState } from "./components/Model";
import ApiManager from "./components/ApiManager";
import { MODELS, findModel } from "./library/models";
import { PROVIDERS, type ApiKeys } from "./library/providers";
import { hasAnyKey, loadKeys } from "./library/keys";
import { readNdjson, type StreamEvent } from "./library/stream";

export default function Page() {
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(MODELS.map((m) => m.id));
  const [runOrder, setRunOrder] = useState<string[]>([]);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeys>({});
  const hasKeys = hasAnyKey(keys);
  const loading = runOrder.some((id) => runs[id]?.status === "streaming");

  const abortRef = useRef<AbortController | null>(null);
  // Ignores late updates from a previous run after a new one starts.
  const runIdRef = useRef(0);

  useEffect(() => {
    setKeys(loadKeys());
    return () => abortRef.current?.abort();
  }, []);

  function toggleModel(id: string) {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function runModel(
    runId: number,
    modelId: string,
    signal: AbortSignal,
    update: (runId: number, modelId: string, fn: (prev: RunState) => RunState) => void
  ) {
    const model = findModel(modelId);
    if (!model) return;
    const apiKey = keys[model.provider];
    if (!apiKey) {
      const label = PROVIDERS[model.provider].label;
      update(runId, modelId, (p) => ({ ...p, status: "error", error: `No ${label} API key saved.` }));
      return;
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: modelId, apiKey }),
        signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Server error ${res.status}`);
      }

      for await (const event of readNdjson<StreamEvent>(res.body)) {
        if (event.type === "delta") {
          update(runId, modelId, (p) => ({ ...p, text: p.text + event.text }));
        } else if (event.type === "done") {
          update(runId, modelId, (p) => ({ ...p, status: "done", metrics: event.metrics }));
        } else {
          update(runId, modelId, (p) => ({
            ...p,
            status: "error",
            error: event.message,
            metrics: event.metrics,
          }));
        }
      }
      // Stream closed without a final event (e.g. connection dropped).
      update(runId, modelId, (p) =>
        p.status === "streaming" ? { ...p, status: "error", error: "Connection closed early." } : p
      );
    } catch (err) {
      if (signal.aborted) {
        update(runId, modelId, (p) => (p.status === "streaming" ? { ...p, status: "stopped" } : p));
      } else {
        const message = err instanceof Error ? err.message : "Unknown error";
        update(runId, modelId, (p) => ({ ...p, status: "error", error: message }));
      }
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!hasKeys) {
      setError("API keys missing — open the API Keys panel on the right and save keys.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;

    // Keep the registry order so columns don't jump around between runs.
    const ids = MODELS.map((m) => m.id).filter((id) => selectedModels.includes(id));
    setRunOrder(ids);
    setRuns(Object.fromEntries(ids.map((id) => [id, { status: "streaming", text: "" }])));

    const update = (id: number, modelId: string, fn: (prev: RunState) => RunState) => {
      if (id !== runIdRef.current) return;
      setRuns((prev) => (prev[modelId] ? { ...prev, [modelId]: fn(prev[modelId]) } : prev));
    };

    await Promise.all(ids.map((id) => runModel(runId, id, controller.signal, update)));
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>Compare Models</h1>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: 2 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              border: "1px solid #e6e6e6",
              background: "#fff",
              boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
            }}
          >
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="prompt" style={{ display: "block", fontWeight: 600 }}>
                  Prompt
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 6,
                    border: "1px solid #ddd",
                    fontFamily: "inherit",
                  }}
                  placeholder="Write your prompt here..."
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 600 }}>Models</label>
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {MODELS.map((m) => (
                    <label
                      key={m.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: selectedModels.includes(m.id) ? "1px solid #2563eb" : "1px solid #e6e6e6",
                        background: selectedModels.includes(m.id) ? "#eef2ff" : "#fafafa",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(m.id)}
                        onChange={() => toggleModel(m.id)}
                      />
                      <span style={{ fontSize: 14 }}>{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  type="submit"
                  disabled={loading || selectedModels.length === 0 || !prompt.trim() || !hasKeys}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: loading ? "#94a3b8" : "#2563eb",
                    color: "#fff",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {loading ? "Comparing..." : "Submit"}
                </button>

                {loading && (
                  <button
                    type="button"
                    onClick={handleStop}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#111827",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Stop
                  </button>
                )}

                {!hasKeys && (
                  <div style={{ color: "#b91c1c", fontSize: 13 }}>
                    API keys missing — open API Keys panel to the right.
                  </div>
                )}
              </div>
            </form>
          </div>
          <div style={{ marginTop: 16 }}>
            {error && (
              <div style={{ color: "red", padding: 8, borderRadius: 6, background: "#fff0f0" }}>{error}</div>
            )}

            {runOrder.length === 0 && (
              <div style={{ marginTop: 12, color: "#6b7280" }}>No results yet. Submit a prompt to compare.</div>
            )}

            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {runOrder.map((id) =>
                runs[id] ? (
                  <Model key={id} label={findModel(id)?.label ?? id} state={runs[id]} />
                ) : null
              )}
            </div>
          </div>
        </div>
        <div style={{ width: 320 }}>
          <div
            style={{
              position: "sticky",
              top: 20,
              padding: 12,
              borderRadius: 8,
              border: "1px solid #e6e6e6",
              background: "#fff",
            }}
          >
            <ApiManager onChange={setKeys} />
          </div>
        </div>
      </div>
    </div>
  );
}