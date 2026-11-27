"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Download, EyeOff, Plus, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/workspace/copy-button";
import { KeysSheet } from "@/components/workspace/keys-sheet";
import { DiffDialog } from "@/components/workspace/diff-dialog";
import { CommandMenu } from "@/components/workspace/command-menu";
import Model from "./Model";
import { streamGenerate, type RunState } from "../library/generateClient";
import { MODELS, findModel } from "../library/models";
import { modelColor } from "../library/modelColors";
import { PROVIDERS, PROVIDER_IDS, type ApiKeys, type ProviderId, type SavedKeyInfo } from "../library/providers";
import { clearKeys, hasAnyKey, loadKeys } from "../library/keys";
import { saveKeyToAccount, upsertKey } from "../library/accountKeys";
import SettingsPanel from "./SettingsPanel";
import { loadStoredSettings, storeSettings } from "../library/settingsStorage";
import TemplatePicker from "./TemplatePicker";
import { blindLabel, shuffle } from "../library/blind";
import JudgePanel from "./JudgePanel";
import { verdictLine, type JudgeVerdict } from "../library/judge";
import { MAX_TURNS, buildHistory, type ChatMessage } from "../library/conversation";
import { MAX_PROMPT_CHARS } from "../library/limits";
import { RESULT_COLUMNS, downloadCsv, resultRow, toCsv } from "../library/csv";
import {
  EMPTY_SETTINGS,
  compactSettings,
  effectiveSettings,
  settingsError,
  type ComparisonSettings,
} from "../library/settings";

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

/** Prompts a developer might really be weighing models on; clicking one fills the composer. */
const EXAMPLES = [
  "Write a Postgres query that returns each customer's three most recent orders, with a short explanation.",
  "Explain optimistic vs pessimistic locking in two paragraphs, then say which to use for a ticket booking API.",
  "Write a friendly, specific error message for a failed card payment in under 25 words.",
];

type RunRequest = { prompt?: string; messages?: ChatMessage[] };

/** Briefly presses the keycaps inside `root`, so a keyboard shortcut visibly lands. */
function pressKeycaps(root: HTMLElement | null) {
  const caps = root?.querySelectorAll<HTMLElement>('[data-slot="kbd"]') ?? [];
  caps.forEach((cap) => cap.setAttribute("data-pressed", ""));
  window.setTimeout(() => caps.forEach((cap) => cap.removeAttribute("data-pressed")), 140);
}

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
  // Multi-turn: every user message so far (index = turn), the finished states of
  // earlier turns, and the follow-up being typed. `runs` holds the current turn.
  const [turnPrompts, setTurnPrompts] = useState<string[]>([]);
  const [earlier, setEarlier] = useState<Record<string, RunState>[]>([]);
  const [followUp, setFollowUp] = useState("");
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
  const [keysOpen, setKeysOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Browser-held keys (anonymous mode, or waiting to be moved to the account).
  const [keys, setKeys] = useState<ApiKeys>({});
  const [savedKeys, setSavedKeys] = useState<SavedKeyInfo[] | null>(accountKeys);
  const accountMode = savedKeys !== null;
  const [migration, setMigration] = useState<{ busy: boolean; error?: string; dismissed?: boolean }>({
    busy: false,
  });
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const hasProviderKey = (provider: ProviderId) =>
    accountMode ? savedKeys.some((k) => k.provider === provider) : Boolean(keys[provider]);
  const hasKeys = accountMode ? savedKeys.length > 0 : hasAnyKey(keys);
  const keyCount = PROVIDER_IDS.filter((p) => hasProviderKey(p)).length;
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
    storeSettings(next);
  }

  const orderedSelection = MODELS.map((m) => m.id).filter((id) => selectedModels.includes(id));
  const settingsInvalid = [settings.all, ...orderedSelection.map((id) => settings.perModel[id] ?? {})].some(
    (s) => settingsError(s) !== null
  );
  const canSubmit = !loading && selectedModels.length > 0 && prompt.trim().length > 0 && hasKeys && !settingsInvalid;

  function toggleModel(id: string) {
    setSelectedModels((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  const updateRun = (id: number, modelId: string, fn: (prev: RunState) => RunState) => {
    if (id !== runIdRef.current) return;
    setRuns((prev) => (prev[modelId] ? { ...prev, [modelId]: fn(prev[modelId]) } : prev));
  };

  async function runModel(runId: number, modelId: string, comparisonId: string | null, signal: AbortSignal, request: RunRequest) {
    const model = findModel(modelId);
    if (!model) return;
    if (!hasProviderKey(model.provider)) {
      const label = PROVIDERS[model.provider].label;
      const error = accountMode ? `No ${label} key saved to your account.` : `No ${label} API key saved.`;
      updateRun(runId, modelId, (p) => ({ ...p, status: "error", error }));
      return;
    }
    // In account mode the server looks up the saved key; the browser never has it.
    const apiKey = accountMode ? undefined : keys[model.provider];
    await streamGenerate(
      {
        ...request,
        model: modelId,
        apiKey,
        comparisonId: comparisonId ?? undefined,
        settings: effectiveSettings(settings, modelId),
      },
      { signal, onUpdate: (state) => updateRun(runId, modelId, () => state) }
    );
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setError(null);
    if (!hasKeys) {
      setError("Add an API key for at least one provider first.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;

    // Keep the registry order so columns don't jump around between runs; blind
    // runs are shuffled so position doesn't give the models away.
    const ids = blind ? shuffle(orderedSelection) : orderedSelection;
    const text = prompt;
    setRunOrder(ids);
    setBlindRun(blind ? { revealed: false } : null);
    setVerdict(null);
    setRunPrompt(text);
    setTurnPrompts([text]);
    setEarlier([]);
    setFollowUp("");
    setRuns(Object.fromEntries(ids.map((id) => [id, { status: "streaming", text: "" }])));

    setSavedId(null);
    setSaveNotice(null);
    const comparisonId = signedIn ? await createComparison(ids, text, controller.signal) : null;
    if (runId !== runIdRef.current) return;
    setSavedId(comparisonId);

    await Promise.all(ids.map((id) => runModel(runId, id, comparisonId, controller.signal, { prompt: text })));
  }

  /** Creates the history entry. Failure to save never blocks the comparison itself. */
  async function createComparison(ids: string[], text: string, signal: AbortSignal): Promise<string | null> {
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
        body: JSON.stringify({ prompt: text, models: callable, settings: compactSettings(settings, callable), blind }),
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

  /** Clears the results (keeps the prompt) so a new comparison can start. */
  function newComparison() {
    abortRef.current?.abort();
    runIdRef.current++;
    setRunOrder([]);
    setRuns({});
    setTurnPrompts([]);
    setEarlier([]);
    setFollowUp("");
    setBlindRun(null);
    setVerdict(null);
    setSavedId(null);
    setSaveNotice(null);
    setError(null);
    promptRef.current?.focus();
  }

  /** Runs one model again for the current turn (after an error or a stop). */
  async function retryModel(id: string) {
    if (loading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;
    const turn = turnPrompts.length - 1;
    const request: RunRequest =
      turn <= 0
        ? { prompt: runPrompt }
        : {
            messages: [
              ...buildHistory(turnPrompts.slice(0, turn), earlier.map((states) => states[id]?.text)),
              { role: "user", content: turnPrompts[turn] },
            ],
          };
    setRuns((prev) => ({ ...prev, [id]: { status: "streaming", text: "" } }));
    await runModel(runId, id, savedId, controller.signal, request);
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

  /** Sends a follow-up to every model in the conversation, each with its own history. */
  async function sendFollowUp(e?: React.FormEvent) {
    e?.preventDefault();
    const content = followUp.trim();
    if (!content || loading) return;
    const turn = turnPrompts.length;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;

    const histories = Object.fromEntries(
      runOrder.map((id) => [
        id,
        [
          ...buildHistory(turnPrompts, [...earlier.map((states) => states[id]?.text), runs[id]?.text]),
          { role: "user" as const, content },
        ],
      ])
    );
    setEarlier((prev) => [...prev, runs]);
    setTurnPrompts((prev) => [...prev, content]);
    setFollowUp("");
    setRuns(Object.fromEntries(runOrder.map((id) => [id, { status: "streaming", text: "" }])));

    // Saved conversations store the message first, so the answers can be saved under it.
    let comparisonId = savedId;
    if (savedId) {
      try {
        const res = await fetch(`/api/comparisons/${savedId}/turns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turn, content }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `Server error ${res.status}`);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Stopped before any model started: nothing will update these cards.
          setRuns((prev) =>
            Object.fromEntries(Object.entries(prev).map(([id, r]) => [id, { ...r, status: "stopped" as const }]))
          );
          return;
        }
        comparisonId = null;
        setSavedId(null);
        setSaveNotice(
          `Follow-up not saved (${err instanceof Error ? err.message : "unknown error"}), so the rest of this conversation won't be saved.`
        );
      }
    }
    if (runId !== runIdRef.current) return;

    await Promise.all(
      runOrder.map((id) => runModel(runId, id, comparisonId, controller.signal, { messages: histories[id] }))
    );
  }

  function exportCsv() {
    const judgeName = verdict ? findModel(verdict.judgeModelId)?.label ?? verdict.judgeModelId : "";
    const allTurns = [...earlier, runs];
    const rows = allTurns.flatMap((states, turn) =>
      runOrder.map((id) =>
        resultRow({
          prompt: turnPrompts[turn] ?? runPrompt,
          turn,
          modelId: id,
          state: states[id] ?? { status: "error", text: "", error: "No answer" },
          settings: effectiveSettings(settings, id),
          judgeScores:
            turn === 0 && verdict?.scores[id] ? [`${judgeName} ${verdict.scores[id].score}/10`] : undefined,
          blindPick: turn === 0 && blindRun?.pick === id,
        })
      )
    );
    downloadCsv(`ai-pasta-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`, toCsv(RESULT_COLUMNS, rows));
  }

  const answeredIds = runOrder.filter((id) => runs[id]?.status === "done");
  const hiddenNames = blindRun !== null && !blindRun.revealed;
  const displayName = (id: string) => (hiddenNames ? blindLabel(runOrder.indexOf(id)) : findModel(id)?.label ?? id);
  const judgeOptions = MODELS.map((m) => m.id).filter((id) => {
    const model = findModel(id);
    return model && hasProviderKey(model.provider);
  });
  const finishedAnswers = answeredIds.map((id) => ({ modelId: id, text: runs[id].text })).filter((a) => a.text.trim());
  const awaitingVote = blindRun !== null && !blindRun.revealed && !loading && runOrder.length > 0;
  const hasResults = runOrder.length > 0;
  const inConversation = hasResults && !loading && !hiddenNames && turnPrompts.length < MAX_TURNS;

  // "Fastest" and "Cheapest" among finished answers, once names are visible.
  const measured = answeredIds.filter((id) => runs[id].metrics);
  const fastest =
    !hiddenNames && !loading && measured.length >= 2
      ? measured.reduce((a, b) => (runs[b].metrics!.totalMs < runs[a].metrics!.totalMs ? b : a))
      : null;
  const priced = measured.filter((id) => runs[id].metrics!.costUsd !== undefined);
  const cheapest =
    !hiddenNames && !loading && priced.length >= 2
      ? priced.reduce((a, b) => (runs[b].metrics!.costUsd! < runs[a].metrics!.costUsd! ? b : a))
      : null;
  const doneCount = runOrder.filter((id) => runs[id] && runs[id].status !== "streaming").length;

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
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pt-5 pb-10 sm:px-6">
      <h1 className="sr-only">Compare models</h1>
      <CommandMenu
        newComparison={newComparison}
        focusPrompt={() => promptRef.current?.focus()}
        toggleBlind={() => setBlind((b) => !b)}
        openSettings={() => setSettingsOpen(true)}
        openKeys={() => setKeysOpen(true)}
        exportCsv={hasResults && !hiddenNames && !loading ? exportCsv : undefined}
        toggleModel={toggleModel}
        selectedModels={selectedModels}
        signedIn={signedIn}
      />
      <div aria-live="polite" className="sr-only">
        {hasResults ? (loading ? `${doneCount} of ${runOrder.length} answers finished` : "All answers finished") : ""}
      </div>

      {showMigration && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm"
        >
          <span className="min-w-60 flex-1">
            This browser has API keys saved locally. Move them to your account so they&apos;re encrypted and work on
            any device?
            {migration.error && <span className="mt-1 block text-danger">{migration.error}</span>}
          </span>
          <Button type="button" size="sm" onClick={moveBrowserKeys} disabled={migration.busy}>
            {migration.busy ? "Moving…" : "Move to account"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMigration({ busy: false, dismissed: true })}>
            Not now
          </Button>
        </div>
      )}

      {/* Composer: prompt, models and run options. Sheets sit outside the form so their own forms never submit it. */}
      <section aria-label="Composer" className="relative rounded-2xl border bg-card shadow-window">
        {loading && runOrder.length > 0 && (
          <div aria-hidden className="run-progress">
            <span style={{ transform: `scaleX(${Math.max(0.04, doneCount / runOrder.length)})` }} />
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <Label htmlFor="prompt" className="sr-only">
            Prompt
          </Label>
          <textarea
            id="prompt"
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                pressKeycaps(e.currentTarget.form);
                handleSubmit();
              }
            }}
            rows={4}
            maxLength={MAX_PROMPT_CHARS}
            placeholder="Ask every model the same thing…"
            className="block max-h-[40vh] min-h-28 w-full resize-y rounded-t-2xl bg-transparent px-4 pt-4 pb-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />

          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
            <fieldset className="flex flex-wrap items-center gap-1.5">
              <legend className="sr-only">Models</legend>
              {MODELS.map((m) => {
                const checked = selectedModels.includes(m.id);
                const keyed = hasProviderKey(m.provider);
                return (
                  <label
                    key={m.id}
                    className={cn(
                      "relative inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-[13px] select-none",
                      "transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.97]",
                      "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      checked ? "border-foreground/20 bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                    title={keyed ? undefined : `No ${PROVIDERS[m.provider].label} key yet`}
                  >
                    {/* Invisible but covering the chip, so a click anywhere toggles the real checkbox. */}
                    <input
                      type="checkbox"
                      className="absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-full opacity-0"
                      checked={checked}
                      onChange={() => toggleModel(m.id)}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full transition-[opacity,transform] duration-300 ease-out-expo",
                        !checked && "scale-75 opacity-40"
                      )}
                      style={{ background: modelColor(m.id) }}
                    />
                    {m.label}
                    {!keyed && <span className="text-xs text-muted-foreground">no key</span>}
                  </label>
                );
              })}
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t px-3 py-2.5">
            <TemplatePicker signedIn={signedIn} prompt={prompt} onLoad={setPrompt} />
            <div className="flex items-center gap-2 pl-1">
              <Checkbox id="blind" checked={blind} onCheckedChange={(v) => setBlind(v === true)} />
              <Label htmlFor="blind" className="cursor-pointer text-[13px] font-normal text-muted-foreground">
                <EyeOff className="size-3.5" aria-hidden />
                <span>
                  <span className="text-foreground">Blind mode</span>: hide model names until you pick the best answer
                </span>
              </Label>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
                <Kbd>⌘</Kbd>
                <Kbd>↵</Kbd>
              </span>
              {loading ? (
                <Button type="button" variant="secondary" onClick={handleStop}>
                  <Square className="size-3.5 fill-current" /> Stop
                </Button>
              ) : null}
              <Button type="submit" disabled={!canSubmit} aria-label={loading ? "Comparing…" : "Compare"}>
                {loading ? "Comparing…" : "Compare"}
                {!loading && <ArrowUp className="size-4" />}
              </Button>
            </div>
          </div>
        </form>

        {/* Outside the form: these open sheets whose forms must not submit the comparison. */}
        <div className="flex flex-wrap items-center gap-1 border-t px-2 py-1.5">
          <SettingsPanel
            value={settings}
            onChange={changeSettings}
            modelIds={orderedSelection}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            className="max-w-[60%]"
          />
          <KeysSheet
            open={keysOpen}
            onOpenChange={setKeysOpen}
            count={keyCount}
            accountKeys={savedKeys}
            onAccountKeysChange={setSavedKeys}
            onBrowserKeysChange={setKeys}
          />
          <span className="ml-auto hidden pr-2 text-xs text-muted-foreground sm:block">
            <Kbd>⌘K</Kbd> for all actions
          </span>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {!hasResults && (
        <section aria-label="Getting started" className="grid gap-3 pt-6 text-center">
          {!hasKeys ? (
            <div className="mx-auto max-w-md space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">Add a key to start comparing</h2>
              <p className="text-sm text-muted-foreground">
                Each model runs on your own provider key, so you pay providers directly and nothing is marked up. One
                key is enough to try it.
              </p>
              <Button type="button" variant="secondary" onClick={() => setKeysOpen(true)}>
                Add API keys
              </Button>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Try a prompt</h2>
              <div className="flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setPrompt(ex);
                      promptRef.current?.focus();
                    }}
                    className="rounded-lg border px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {hasResults && (
        <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <p className="min-w-0 flex-1 truncate text-muted-foreground">
            {turnPrompts.length > 1 ? `Turn ${turnPrompts.length} · ` : ""}
            <span className="text-foreground">{turnPrompts.at(-1)}</span>
          </p>
          {/* Hidden during a blind vote: the saved page shows model names. */}
          {savedId && (!blindRun || blindRun.revealed) && (
            <span className="text-xs text-muted-foreground">
              Saved to your history ·{" "}
              <Link href={`/c/${savedId}`} className="text-foreground underline">
                Open
              </Link>
            </span>
          )}
          {authEnabled && !signedIn && <span className="text-xs text-muted-foreground">Sign in to save comparisons to your history.</span>}
          <div className="flex items-center gap-1">
            {!loading && !hiddenNames && (
              <DiffDialog
                answers={finishedAnswers.map((a) => ({ id: a.modelId, label: displayName(a.modelId), text: a.text }))}
              />
            )}
            {/* Not during a blind vote: the file names the models. */}
            {!loading && !hiddenNames && (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={exportCsv}>
                <Download className="size-4" /> Export CSV
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={newComparison}>
              <Plus className="size-4" /> New comparison
            </Button>
          </div>
        </div>
      )}
      {saveNotice && <p className="text-sm text-warning">{saveNotice}</p>}

      {awaitingVote && (
        <div
          role="group"
          aria-label="Blind vote"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-1 duration-300 ease-out-expo"
        >
          {answeredIds.length >= 2 ? (
            <>
              <span className="min-w-56 flex-1">Which answer is best? Names are revealed after you vote.</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => vote(null)}>
                It&apos;s a tie
              </Button>
            </>
          ) : (
            <>
              <span className="min-w-56 flex-1">Fewer than two models answered, so there&apos;s nothing to vote on.</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => setBlindRun({ revealed: true })}>
                Reveal names
              </Button>
            </>
          )}
        </div>
      )}
      {blindRun?.revealed && (
        <p role="status" className="text-sm animate-in fade-in duration-500 ease-out-expo">
          {blindRun.pick === undefined
            ? "Names revealed."
            : blindRun.pick === null
              ? "You called it a tie."
              : `You picked ${findModel(blindRun.pick)?.label ?? blindRun.pick}.`}
          {savedId && blindRun.pick !== undefined && !blindRun.saveError && " Saved to your leaderboard."}
          {blindRun.saveError && <span className="text-danger"> {blindRun.saveError}</span>}
        </p>
      )}

      {hasResults && <h2 className="sr-only">Answers</h2>}
      {hasResults && (
        <div
          className={cn(
            "grid snap-x snap-mandatory auto-cols-[88%] grid-flow-col gap-3 overflow-x-auto pb-2",
            "sm:auto-cols-[minmax(320px,1fr)] sm:snap-none"
          )}
        >
          {runOrder.map((id, index) => {
            const state = runs[id];
            if (!state) return null;
            const name = findModel(id)?.label ?? id;
            const badges = [
              ...(blindRun?.revealed && blindRun.pick === id ? ["Your pick"] : []),
              ...(fastest === id ? ["Fastest"] : []),
              ...(cheapest === id ? ["Cheapest"] : []),
            ];
            const canRetry = !loading && (state.status === "error" || state.status === "stopped");
            return (
              <Model
                key={id}
                variant="column"
                className="max-h-[min(68vh,720px)] snap-start animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out-expo"
                style={{ animationDelay: `${Math.min(index, 5) * 50}ms` }}
                label={hiddenNames ? blindLabel(index) : name}
                subtitle={blindRun?.revealed ? `was ${blindLabel(index)}` : undefined}
                badges={badges}
                color={modelColor(id)}
                anonymous={hiddenNames}
                state={state}
                actions={
                  <>
                    {state.text && <CopyButton text={state.text} label="Copy answer" />}
                    {canRetry && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="ghost" size="icon-xs" onClick={() => retryModel(id)} aria-label="Retry">
                            <RotateCcw />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Retry</TooltipContent>
                      </Tooltip>
                    )}
                  </>
                }
                earlierTurns={earlier.map((states, t) => ({
                  prompt: turnPrompts[t],
                  state: states[id] ?? { status: "error", text: "", error: "No answer" },
                }))}
                currentPrompt={turnPrompts.at(-1)}
                footer={
                  <>
                    {earlier.length === 0 && verdict && verdictLine(verdict, id, displayName) && (
                      <p className="mt-3 border-t pt-2 text-[13px] text-muted-foreground">
                        <strong className="font-medium text-foreground">Judge:</strong> {verdictLine(verdict, id, displayName)}
                      </p>
                    )}
                    {awaitingVote && answeredIds.length >= 2 && state.status === "done" && (
                      <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => vote(id)}>
                        Pick {blindLabel(index)}
                      </Button>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      )}

      {/* The judge scores the first prompt's answers, so it's offered before any follow-up. */}
      {!loading && turnPrompts.length <= 1 && finishedAnswers.length >= 2 && judgeOptions.length > 0 && (
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

      {inConversation && (
        <form
          role="group"
          aria-label="Follow-up"
          onSubmit={sendFollowUp}
          className="mx-auto w-full max-w-3xl rounded-2xl border bg-card shadow-window animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out-expo"
        >
          <textarea
            id="follow-up"
            aria-label="Follow-up"
            aria-describedby="follow-up-hint"
            rows={2}
            value={followUp}
            maxLength={MAX_PROMPT_CHARS}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                pressKeycaps(e.currentTarget.form);
                sendFollowUp();
              }
            }}
            placeholder="Ask every model a follow-up question…"
            className="block w-full resize-none rounded-t-2xl bg-transparent px-4 pt-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-2 px-3 pb-2.5">
            <span id="follow-up-hint" className="text-xs text-muted-foreground">
              turn {turnPrompts.length + 1} of {MAX_TURNS}; each model continues its own conversation
            </span>
            <Button type="submit" size="sm" className="ml-auto" disabled={!followUp.trim()}>
              Send follow-up <ArrowUp className="size-4" />
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
