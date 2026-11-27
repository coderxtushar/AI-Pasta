"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Model from "@/app/components/Model";
import type { RunState } from "@/app/library/generateClient";
import { findModel } from "@/app/library/models";
import { modelColor } from "@/app/library/modelColors";

export type DemoAnswer = {
  modelId: string;
  text: string;
  ttftMs: number;
  totalMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};

export type DemoRun = {
  /** "illustrative": hand-written example; "recorded": captured with `npm run demo:capture`. */
  source: "illustrative" | "recorded";
  recordedAt: string | null;
  prompt: string;
  answers: DemoAnswer[];
};

/** Longest a replay plays for; slower recorded runs are sped up and say so. */
const MAX_PLAY_MS = 6000;
const TICK_MS = 50;

function stateAt(a: DemoAnswer, elapsed: number): RunState {
  if (elapsed >= a.totalMs) {
    return {
      status: "done",
      text: a.text,
      metrics: {
        ttftMs: a.ttftMs,
        totalMs: a.totalMs,
        inputTokens: a.inputTokens,
        outputTokens: a.outputTokens,
        costUsd: a.costUsd,
      },
    };
  }
  if (elapsed < a.ttftMs) return { status: "streaming", text: "" };
  const progress = (elapsed - a.ttftMs) / Math.max(1, a.totalMs - a.ttftMs);
  return { status: "streaming", text: a.text.slice(0, Math.max(1, Math.floor(a.text.length * progress))) };
}

/**
 * The landing page's proof: a comparison replayed at its own timings (each answer
 * starts at its time to first token and ends at its total time).
 */
export function DemoReplay({ run }: { run: DemoRun }) {
  const longest = Math.max(...run.answers.map((a) => a.totalMs));
  const speed = Math.max(1, longest / MAX_PLAY_MS);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef<number | null>(null);

  const play = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(longest);
      return;
    }
    startedRef.current = performance.now();
    setElapsed(0);
    setPlaying(true);
  }, [longest]);

  // Start once, as soon as any of the window is on screen (it is in the first viewport).
  // With reduced motion, show the finished run straight away.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(longest);
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          play();
          observer.disconnect();
        }
      },
      { threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [play, longest]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const t = (performance.now() - (startedRef.current ?? 0)) * speed;
      setElapsed(t);
      if (t >= longest) setPlaying(false);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed, longest]);

  const states = run.answers.map((a) => stateAt(a, elapsed));
  const finished = !playing && elapsed >= longest;
  const measured = run.answers.filter((_, i) => states[i].status === "done");
  const fastest = finished ? measured.reduce((a, b) => (b.totalMs < a.totalMs ? b : a)).modelId : null;
  const priced = measured.filter((a) => a.costUsd !== undefined);
  const cheapest = finished && priced.length >= 2 ? priced.reduce((a, b) => (b.costUsd! < a.costUsd! ? b : a)).modelId : null;

  const label =
    run.source === "recorded" && run.recordedAt
      ? `Replay of a recorded run · ${new Date(run.recordedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}`
      : "Illustrative example · written by hand, not measured";

  return (
    <div ref={rootRef} className="overflow-hidden rounded-2xl border bg-card shadow-window">
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b bg-subtle px-4 py-2.5">
        <div aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <p className="min-w-0 flex-1 text-center text-xs text-pretty text-muted-foreground">
          {label}
          {speed > 1 && ` · played at ${speed.toFixed(1)}× speed`}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={play}
          disabled={playing}
          className="text-muted-foreground"
          aria-label="Replay the comparison"
        >
          <RotateCcw /> Replay
        </Button>
      </div>

      {/* Prompt row */}
      <div className="flex flex-col items-start gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm">
          <span className="text-muted-foreground">Prompt · </span>
          {run.prompt}
        </p>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/app?prompt=${encodeURIComponent(run.prompt)}`}>
            Try this prompt <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      {/* Answers */}
      <div
        aria-label="Answers"
        className="grid snap-x snap-mandatory auto-cols-[85%] grid-flow-col gap-3 overflow-x-auto bg-background/40 p-3 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3"
      >
        {run.answers.map((a, i) => (
          <Model
            key={a.modelId}
            variant="column"
            className="h-[280px] snap-start sm:h-[230px] lg:h-[200px]"
            label={findModel(a.modelId)?.label ?? a.modelId}
            color={modelColor(a.modelId)}
            state={states[i]}
            badges={[...(fastest === a.modelId ? ["Fastest"] : []), ...(cheapest === a.modelId ? ["Cheapest"] : [])]}
          />
        ))}
      </div>
    </div>
  );
}
