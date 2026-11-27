// CSV export (client-safe; also used by the server download route).
import type { RunState } from "./generateClient";
import { findModel } from "./models";
import { describeSettings, type GenerationSettings } from "./settings";

export type CsvValue = string | number | null | undefined;

/**
 * Model output is untrusted. A cell starting with = + - @ (or a tab/CR) is run as a
 * formula by Excel and Sheets, so such text is prefixed with an apostrophe.
 */
function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with CRLF line endings. */
export function toCsv(columns: readonly string[], rows: Record<string, CsvValue>[]): string {
  const lines = [columns.map(cell).join(","), ...rows.map((row) => columns.map((c) => cell(row[c])).join(","))];
  return lines.join("\r\n") + "\r\n";
}

export const RESULT_COLUMNS = [
  "prompt",
  "input",
  "turn",
  "model",
  "model_label",
  "status",
  "answer",
  "error",
  "ttft_ms",
  "total_ms",
  "input_tokens",
  "output_tokens",
  "reasoning_tokens",
  "cost_usd",
  "notes",
  "settings",
  "judge_scores",
  "blind_pick",
] as const;

export type ResultRowInput = {
  prompt: string;
  input?: string;
  /** 0 for the first prompt, 1+ for follow-ups. */
  turn?: number;
  modelId: string;
  state: RunState;
  settings?: GenerationSettings;
  /** e.g. ["DeepSeek Chat 9/10"] */
  judgeScores?: string[];
  blindPick?: boolean;
};

export function resultRow(r: ResultRowInput): Record<string, CsvValue> {
  const m = r.state.metrics;
  return {
    prompt: r.prompt,
    input: r.input,
    turn: r.turn ?? 0,
    model: r.modelId,
    model_label: findModel(r.modelId)?.label ?? r.modelId,
    status: r.state.status,
    answer: r.state.text,
    error: r.state.error,
    ttft_ms: m?.ttftMs,
    total_ms: m?.totalMs,
    input_tokens: m?.inputTokens,
    output_tokens: m?.outputTokens,
    reasoning_tokens: m?.reasoningTokens,
    cost_usd: m?.costUsd,
    notes: m?.notes?.join("; "),
    settings: r.settings ? describeSettings(r.settings) : undefined,
    judge_scores: r.judgeScores?.join("; "),
    blind_pick: r.blindPick ? "yes" : undefined,
  };
}

/** Starts a download in the browser. The BOM makes Excel read the file as UTF-8. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
