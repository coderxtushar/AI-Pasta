"use client";

import { useMemo, useState } from "react";
import { diffWords } from "diff";
import { GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Answer = { id: string; label: string; text: string };

const selectClass =
  "h-8 rounded-md border bg-transparent px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Word-level diff between two finished answers. */
export function DiffDialog({ answers }: { answers: Answer[] }) {
  const [left, setLeft] = useState(answers[0]?.id ?? "");
  const [right, setRight] = useState(answers[1]?.id ?? "");
  const a = answers.find((x) => x.id === left) ?? answers[0];
  const b = answers.find((x) => x.id === right) ?? answers[1];

  const parts = useMemo(() => (a && b ? diffWords(a.text, b.text) : []), [a, b]);
  const changed = parts.filter((p) => p.added || p.removed).reduce((n, p) => n + p.value.trim().split(/\s+/).length, 0);

  if (answers.length < 2) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <GitCompareArrows className="size-4" />
          Compare answers
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compare two answers</DialogTitle>
          <DialogDescription>
            Words only in the first answer are struck through; words only in the second are highlighted.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="sr-only">First answer</span>
            <select aria-label="First answer" value={a?.id} onChange={(e) => setLeft(e.target.value)} className={selectClass}>
              {answers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <span className="text-muted-foreground">vs</span>
          <select aria-label="Second answer" value={b?.id} onChange={(e) => setRight(e.target.value)} className={selectClass}>
            {answers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <span className="ml-auto font-mono text-xs text-muted-foreground tabular">{changed} words differ</span>
        </div>
        <div className="min-h-0 overflow-y-auto rounded-lg border bg-subtle p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {a?.id === b?.id ? (
            <p className="text-muted-foreground">Pick two different answers.</p>
          ) : (
            parts.map((p, i) =>
              p.added ? (
                <ins key={i} className="rounded-sm bg-success/20 text-foreground no-underline">
                  {p.value}
                </ins>
              ) : p.removed ? (
                <del key={i} className="rounded-sm bg-danger/15 text-muted-foreground">
                  {p.value}
                </del>
              ) : (
                <span key={i}>{p.value}</span>
              )
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
