"use client";
import React from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AnswerMarkdown } from "@/components/workspace/answer-markdown";
import type { GenerateMetrics } from "../library/stream";
import type { RunState } from "../library/generateClient";
import { formatMetrics } from "../library/format";

export type { RunState };

type ModelProps = {
  label: string;
  state: RunState;
  /** Smaller text next to the label, e.g. "was Model B" after a blind reveal. */
  subtitle?: string;
  /** Short highlights, e.g. "Your pick", "Fastest". */
  badge?: string;
  badges?: string[];
  /** The model's colour dot (a CSS colour); grey when anonymous. */
  color?: string;
  /**
   * Blind mode before the vote: hide everything that could identify the model
   * (latency, tokens, cost, provider notes and provider-specific errors).
   */
  anonymous?: boolean;
  /** Buttons in the header (copy, retry). */
  actions?: React.ReactNode;
  /** Extra content under the answer (vote button, judge verdict). */
  footer?: React.ReactNode;
  /** Earlier turns of a multi-turn conversation, oldest first (turn 0 is the first prompt). */
  earlierTurns?: { prompt: string; state: RunState }[];
  /** The user message this `state` answers; shown when there are earlier turns. */
  currentPrompt?: string;
  /** "column": fixed-height scrolling body for the workspace grid; "card": natural height. */
  variant?: "column" | "card";
  className?: string;
};

const STATUS: Record<RunState["status"], { text: string; tone: string }> = {
  streaming: { text: "Streaming…", tone: "text-brand" },
  done: { text: "Done", tone: "text-success" },
  error: { text: "Error", tone: "text-danger" },
  stopped: { text: "Stopped", tone: "text-muted-foreground" },
};

function UserMessage({ text }: { text: string }) {
  return (
    <div className="my-3 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
      <span className="font-medium">You:</span> {text}
    </div>
  );
}

function MetricsLine({ metrics }: { metrics: GenerateMetrics }) {
  // Each item stays on one line; the line wraps only between items.
  const parts = formatMetrics(metrics).split(" · ");
  return (
    <div className="font-mono text-[11.5px] leading-5 text-muted-foreground tabular">
      {parts.map((part, i) => (
        <span key={i} className="whitespace-nowrap">
          {part}
          {i < parts.length - 1 && " · "}
        </span>
      ))}
    </div>
  );
}

function Notes({ notes }: { notes?: string[] }) {
  if (!notes?.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {notes.map((note) => (
        <li key={note} className="flex gap-1.5 text-xs text-warning">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>Note: {note}</span>
        </li>
      ))}
    </ul>
  );
}

/** A finished earlier turn, kept compact. */
function EarlierAnswer({ state }: { state: RunState }) {
  return (
    <div>
      {state.text && <AnswerMarkdown text={state.text} streaming={false} />}
      {state.status !== "done" && (
        <div className="mt-1 text-xs text-danger">
          {state.status === "stopped" ? "Stopped." : `Error: ${state.error ?? "no answer"}`}
        </div>
      )}
      {state.metrics && <MetricsLine metrics={state.metrics} />}
    </div>
  );
}

/** One model's answer: header, the conversation so far, the current answer, metrics. */
const Model: React.FC<ModelProps> = ({
  label,
  state,
  subtitle,
  badge,
  badges = [],
  color,
  anonymous,
  actions,
  footer,
  earlierTurns = [],
  currentPrompt,
  variant = "card",
  className,
}) => {
  const status =
    state.status === "streaming" && state.waitingSec
      ? { text: `Rate limited, retrying in ${state.waitingSec}s…`, tone: "text-warning" }
      : STATUS[state.status];
  const allBadges = [...(badge ? [badge] : []), ...badges];
  const streaming = state.status === "streaming";
  const waitingForFirstToken = streaming && !state.text && !state.waitingSec;

  return (
    <section
      aria-label={label}
      aria-busy={streaming}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground",
        variant === "column" && "h-full",
        className
      )}
    >
      <header className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: anonymous || !color ? "var(--muted-foreground)" : color }}
        />
        <h3 className="min-w-0 truncate text-sm font-semibold">
          {label}
          {subtitle && <span className="ml-2 text-xs font-normal text-muted-foreground">{subtitle}</span>}
        </h3>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {allBadges.map((b) => (
            <span key={b} className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
              {b}
            </span>
          ))}
          <span className={cn("text-xs font-medium", status.tone)}>{status.text}</span>
          {actions}
        </div>
      </header>

      <div className={cn("min-h-0 flex-1 px-3.5 py-3", variant === "column" && "overflow-y-auto")}>
        {earlierTurns.map((t, i) => (
          <div key={i} aria-label={`Turn ${i + 1}`} className="border-b border-dashed pb-3 mb-3 last:mb-0">
            {i > 0 && <UserMessage text={t.prompt} />}
            <EarlierAnswer state={t.state} />
          </div>
        ))}
        {earlierTurns.length > 0 && currentPrompt && <UserMessage text={currentPrompt} />}

        {waitingForFirstToken && (
          <div className="space-y-2 py-1" aria-hidden>
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
        {state.text && <AnswerMarkdown text={state.text} streaming={streaming} />}

        {state.status === "error" && state.error && (
          <div className="mt-2 flex gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{anonymous ? "This model's answer failed. Details appear after you vote." : `Error: ${state.error}`}</span>
          </div>
        )}
        {footer}
      </div>

      {!anonymous && state.metrics && (
        <footer className="border-t bg-subtle px-3.5 py-2">
          {state.metrics && <MetricsLine metrics={state.metrics} />}
          <Notes notes={state.metrics?.notes} />
        </footer>
      )}
    </section>
  );
};

export default Model;
