"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Model, { type RunState } from "./Model";
import ApiManager from "./ApiManager";
import AccountKeyManager from "./AccountKeyManager";
import { MODELS, findModel } from "../library/models";
import { PROVIDERS, PROVIDER_IDS, type ApiKeys, type ProviderId, type SavedKeyInfo } from "../library/providers";
import { clearKeys, hasAnyKey, loadKeys } from "../library/keys";
import { saveKeyToAccount, upsertKey } from "../library/accountKeys";
import { readNdjson, type StreamEvent } from "../library/stream";
import SettingsPanel from "./SettingsPanel";
import { blindLabel, shuffle } from "../library/blind";
import JudgePanel from "./JudgePanel";
import { verdictLine, type JudgeVerdict } from "../library/judge";
import {
  EMPTY_SETTINGS,
  compactSettings,
  effectiveSettings,
  settingsError,
  type ComparisonSettings,
} from "../library/settings";

const SETTINGS_STORAGE_KEY = "generationSettings";

const voteButton: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #6366f1",
  background: "#fff",
  color: "#3730a3",
  cursor: "pointer",
  fontWeight: 600,
};

function loadStoredSettings(): ComparisonSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.all === "object" && typeof parsed.perModel === "object" ? parsed : null;
  } catch {
    return null;
  }
}

type Props = {
  /** Signed-in users get each run saved to their history. */
  signedIn: boolean;
  /** False when auth isn't configured; hides the "sign in to save" hint. */
  authEnabled: boolean;
  /**
   * Keys saved to the signed-in account (hints only). Null means keys live in
   * this browser instead (signed out, or account key storage not configured).
   */
  accountKeys: SavedKeyInfo[] | null;
  /** Pre-fill from an earlier comparison (re-run). */
  initialPrompt?: string;
  initialModels?: string[];
  initialSettings?: ComparisonSettings | null;
};

export default function Compare({
  signedIn,
  authEnabled,
  accountKeys,
  initialPrompt,
  initialModels,
  initialSettings,
}: Props) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [selectedModels, setSelectedModels] = useState<string[]>(
    initialModels?.length ? initialModels : MODELS.map((m) => m.id)
  );
  const [settings, setSettings] = useState<ComparisonSettings>(initialSettings ?? EMPTY_SETTINGS);
  const [runOrder, setRunOrder] = useState<string[]>([]);
  const [blind, setBlind] = useState(false);
  const [verdict, setVerdict] = useState<JudgeVerdict | null>(null);
  // The prompt the current results answer (the textarea may have changed since).
  const [runPrompt, setRunPrompt] = useState("");
  // The current run's blind state. Null when the run wasn't blind.
  const [blindRun, setBlindRun] = useState<{
    revealed: boolean;
    /** undefined: not voted yet; null: tie; otherwise the winning model ID. */
    pick?: string | null;
    saveError?: string;
  } | null>(null);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  // Browser-held keys (anonymous mode, or waiting to be moved to the account).
  const [keys, setKeys] = useState<ApiKeys>({});
  const [savedKeys, setSavedKeys] = useState<SavedKeyInfo[] | null>(accountKeys);
  const accountMode = savedKeys !== null;
  const [migration, setMigration] = useState<{ busy: boolean; error?: string; dismissed?: boolean }>({
    busy: false,
  });

  const hasProviderKey = (provider: ProviderId) =>
    accountMode ? savedKeys.some((k) => k.provider === provider) : Boolean(keys[provider]);
  const hasKeys = accountMode ? savedKeys.length > 0 : hasAnyKey(keys);
  const showMigration = accountMode && hasAnyKey(keys) && !migration.dismissed;
  const loading = runOrder.some((id) => runs[id]?.status === "streaming");

  const abortRef = useRef<AbortController | null>(null);
  // Ignores late updates from a previous run after a new one starts.
  const runIdRef = useRef(0);

  useEffect(() => {
    setKeys(loadKeys());
    // A re-run brings its own settings; otherwise restore this browser's last ones.
    if (!initialSettings) {
      const stored = loadStoredSettings();
      if (stored) setSettings(stored);
    }
    return () => abortRef.current?.abort();
  }, [initialSettings]);

  function changeSettings(next: ComparisonSettings) {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode); settings still apply to this session.
    }
  }

  const orderedSelection = MODELS.map((m) => m.id).filter((id) => selectedModels.includes(id));
  const settingsInvalid = [settings.all, ...orderedSelection.map((id) => settings.perModel[id] ?? {})].some(
    (s) => settingsError(s) !== null
  );

  function toggleModel(id: string) {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function runModel(
    runId: number,
    modelId: string,
    comparisonId: string | null,
    signal: AbortSignal,
    update: (runId: number, modelId: string, fn: (prev: RunState) => RunState) => void
  ) {
    const model = findModel(modelId);
    if (!model) return;
    if (!hasProviderKey(model.provider)) {
      const label = PROVIDERS[model.provider].label;
      const error = accountMode ? `No ${label} key saved to your account.` : `No ${label} API key saved.`;
      update(runId, modelId, (p) => ({ ...p, status: "error", error }));
      return;
    }
    // In account mode the server looks up the saved key; the browser never has it.
    const apiKey = accountMode ? undefined : keys[model.provider];

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: modelId,
          apiKey,
          comparisonId: comparisonId ?? undefined,
          settings: effectiveSettings(settings, modelId),
        }),
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

    // Keep the registry order so columns don't jump around between runs; blind
    // runs are shuffled so position doesn't give the models away.
    const ids = blind ? shuffle(orderedSelection) : orderedSelection;
    setRunOrder(ids);
    setBlindRun(blind ? { revealed: false } : null);
    setVerdict(null);
    setRunPrompt(prompt);
    setRuns(Object.fromEntries(ids.map((id) => [id, { status: "streaming", text: "" }])));

    const update = (id: number, modelId: string, fn: (prev: RunState) => RunState) => {
      if (id !== runIdRef.current) return;
      setRuns((prev) => (prev[modelId] ? { ...prev, [modelId]: fn(prev[modelId]) } : prev));
    };

    setSavedId(null);
    setSaveNotice(null);
    const comparisonId = signedIn ? await createComparison(ids, controller.signal) : null;
    if (runId !== runIdRef.current) return;
    setSavedId(comparisonId);

    await Promise.all(ids.map((id) => runModel(runId, id, comparisonId, controller.signal, update)));
  }

  /** Creates the history entry. Failure to save never blocks the comparison itself. */
  async function createComparison(ids: string[], signal: AbortSignal): Promise<string | null> {
    // Only models we can actually call get stored with the comparison.
    const callable = ids.filter((id) => {
      const model = findModel(id);
      return model && hasProviderKey(model.provider);
    });
    if (callable.length === 0) return null;
    try {
      const res = await fetch("/api/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, models: callable, settings: compactSettings(settings, callable), blind }),
        signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.id !== "string") throw new Error(data?.error ?? `Server error ${res.status}`);
      return data.id;
    } catch (err) {
      if (!signal.aborted) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setSaveNotice(`Not saved to history: ${message}`);
      }
      return null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  /** Reveals the names and, for saved comparisons, records the pick (null = tie). */
  async function vote(winner: string | null) {
    setBlindRun({ revealed: true, pick: winner });
    if (!savedId) return;
    try {
      const res = await fetch(`/api/comparisons/${savedId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Server error ${res.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setBlindRun({ revealed: true, pick: winner, saveError: `Vote not saved: ${message}` });
    }
  }

  const answeredIds = runOrder.filter((id) => runs[id]?.status === "done");
  const hiddenNames = blindRun !== null && !blindRun.revealed;
  const displayName = (id: string) =>
    hiddenNames ? blindLabel(runOrder.indexOf(id)) : findModel(id)?.label ?? id;
  const judgeOptions = MODELS.map((m) => m.id).filter((id) => {
    const model = findModel(id);
    return model && hasProviderKey(model.provider);
  });
  const finishedAnswers = answeredIds
    .map((id) => ({ modelId: id, text: runs[id].text }))
    .filter((a) => a.text.trim());
  const awaitingVote = blindRun !== null && !blindRun.revealed && !loading && runOrder.length > 0;

  /** Moves keys held in this browser into the account, then clears them locally. */
  async function moveBrowserKeys() {
    if (!savedKeys) return;
    setMigration({ busy: true });
    let next = savedKeys;
    const failed: string[] = [];
    for (const provider of PROVIDER_IDS) {
      const value = keys[provider];
      if (!value) continue;
      try {
        next = upsertKey(next, await saveKeyToAccount(provider, value));
      } catch (err) {
        failed.push(`${PROVIDERS[provider].label} (${err instanceof Error ? err.message : "failed"})`);
      }
    }
    setSavedKeys(next);
    if (failed.length) {
      setMigration({ busy: false, error: `Couldn't move: ${failed.join(", ")}. Browser keys were kept.` });
      return;
    }
    clearKeys();
    setKeys({});
    setMigration({ busy: false });
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>Compare Models</h1>

      {showMigration && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            fontSize: 14,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ flex: 1, minWidth: 240 }}>
            This browser has API keys saved locally. Move them to your account so they&apos;re encrypted and work on
            any device?
            {migration.error && <span style={{ display: "block", color: "#b91c1c" }}>{migration.error}</span>}
          </span>
          <button
            type="button"
            onClick={moveBrowserKeys}
            disabled={migration.busy}
            style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer" }}
          >
            {migration.busy ? "Moving…" : "Move to account"}
          </button>
          <button
            type="button"
            onClick={() => setMigration({ busy: false, dismissed: true })}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
          >
            Not now
          </button>
        </div>
      )}

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

              <SettingsPanel value={settings} onChange={changeSettings} modelIds={orderedSelection} />

              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 8 }}>
                <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
                <span>
                  <strong>Blind mode</strong>: hide model names until you pick the best answer
                </span>
              </label>

              <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  type="submit"
                  disabled={loading || selectedModels.length === 0 || !prompt.trim() || !hasKeys || settingsInvalid}
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

            {/* Hidden during a blind vote: the saved page shows model names. */}
            {savedId && (!blindRun || blindRun.revealed) && (
              <div style={{ fontSize: 13, color: "#374151" }}>
                Saved to your history ·{" "}
                <Link href={`/c/${savedId}`} style={{ color: "#2563eb" }}>
                  Open
                </Link>
              </div>
            )}
            {saveNotice && <div style={{ fontSize: 13, color: "#b45309" }}>{saveNotice}</div>}
            {authEnabled && !signedIn && runOrder.length > 0 && (
              <div style={{ fontSize: 13, color: "#6b7280" }}>Sign in to save comparisons to your history.</div>
            )}

            {runOrder.length === 0 && (
              <div style={{ marginTop: 12, color: "#6b7280" }}>No results yet. Submit a prompt to compare.</div>
            )}

            {awaitingVote && (
              <div
                role="group"
                aria-label="Blind vote"
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #c7d2fe",
                  background: "#eef2ff",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  fontSize: 14,
                }}
              >
                {answeredIds.length >= 2 ? (
                  <>
                    <span style={{ flex: 1, minWidth: 220 }}>Which answer is best? Names are revealed after you vote.</span>
                    <button type="button" onClick={() => vote(null)} style={voteButton}>
                      It&apos;s a tie
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, minWidth: 220 }}>Fewer than two models answered, so there&apos;s nothing to vote on.</span>
                    <button type="button" onClick={() => setBlindRun({ revealed: true })} style={voteButton}>
                      Reveal names
                    </button>
                  </>
                )}
              </div>
            )}
            {blindRun?.revealed && (
              <div role="status" style={{ marginTop: 12, fontSize: 14 }}>
                {blindRun.pick === undefined
                  ? "Names revealed."
                  : blindRun.pick === null
                    ? "You called it a tie."
                    : `You picked ${findModel(blindRun.pick)?.label ?? blindRun.pick}.`}
                {savedId && blindRun.pick !== undefined && !blindRun.saveError && " Saved to your leaderboard."}
                {blindRun.saveError && <span style={{ color: "#b91c1c" }}> {blindRun.saveError}</span>}
              </div>
            )}

            {!loading && finishedAnswers.length >= 2 && judgeOptions.length > 0 && (
              <JudgePanel
                prompt={runPrompt}
                answers={finishedAnswers}
                judgeOptions={judgeOptions}
                apiKeyFor={(modelId) => {
                  const model = findModel(modelId);
                  return accountMode || !model ? undefined : keys[model.provider];
                }}
                comparisonId={savedId}
                displayName={displayName}
                verdict={verdict}
                onVerdict={setVerdict}
              />
            )}

            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {runOrder.map((id, index) => {
                if (!runs[id]) return null;
                const hidden = blindRun !== null && !blindRun.revealed;
                const name = findModel(id)?.label ?? id;
                return (
                  <Model
                    key={id}
                    label={hidden ? blindLabel(index) : name}
                    subtitle={blindRun?.revealed ? `was ${blindLabel(index)}` : undefined}
                    badge={blindRun?.revealed && blindRun.pick === id ? "Your pick" : undefined}
                    anonymous={hidden}
                    state={runs[id]}
                    footer={
                      <>
                        {verdict && verdictLine(verdict, id, displayName) && (
                          <div style={{ marginTop: 8, fontSize: 13, color: "#374151" }}>
                            <strong>Judge:</strong> {verdictLine(verdict, id, displayName)}
                          </div>
                        )}
                        {awaitingVote && answeredIds.length >= 2 && runs[id].status === "done" && (
                          <button type="button" onClick={() => vote(id)} style={{ ...voteButton, marginTop: 10 }}>
                            Pick {blindLabel(index)}
                          </button>
                        )}
                      </>
                    }
                  />
                );
              })}
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
            {accountMode ? (
              <AccountKeyManager keys={savedKeys} onChange={setSavedKeys} />
            ) : (
              <ApiManager onChange={setKeys} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}