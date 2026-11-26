"use client";
import React, { useEffect, useState } from "react";
import Model from "./components/Model";
import ApiManager from "./components/ApiManager";
import { MODELS, findModel } from "./library/models";
import type { ApiKeys } from "./library/providers";
import { hasAnyKey, loadKeys } from "./library/keys";

type ResultItem = {
  model: string;
  output?: string;
  error?: string;
};

type CompareResponse = {
  results?: { model: string; text?: string; error?: string }[];
};

export default function Page() {
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(MODELS.map((m) => m.id));
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeys>({});
  const hasKeys = hasAnyKey(keys);

  useEffect(() => {
    setKeys(loadKeys());
  }, []);

  function toggleModel(id: string) {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!hasKeys) {
      setError("API keys missing — open the API Keys panel on the right and save keys.");
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, models: selectedModels, keys }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Server ${res.status}: ${txt || res.statusText}`);
      }

      const data: CompareResponse = await res.json();
      const parsed: ResultItem[] = (data.results ?? []).map((r) => ({
        model: r.model,
        output: r.text,
        error: r.error,
      }));

      setResults(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
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

            {results.length === 0 && !loading && (
              <div style={{ marginTop: 12, color: "#6b7280" }}>No results yet. Submit a prompt to compare.</div>
            )}

            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {results.map((r) => (
                <div key={r.model}>
                  <Model model={findModel(r.model)?.label ?? r.model} output={r.error ? `Error: ${r.error}` : r.output ?? ""} />
                </div>
              ))}
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