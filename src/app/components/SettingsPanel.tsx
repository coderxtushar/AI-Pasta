"use client";
import React, { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { findModel } from "../library/models";
import { modelColor } from "../library/modelColors";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  SETTINGS_LIMITS as L,
  cleanSettings,
  describeSettings,
  isEmpty,
  settingsError,
  type ComparisonSettings,
  type GenerationSettings,
} from "../library/settings";

type Props = {
  value: ComparisonSettings;
  onChange: (value: ComparisonSettings) => void;
  /** Models that can get their own overrides (the selected ones). */
  modelIds: string[];
  /** Compact trigger for toolbars. */
  className?: string;
  /** Optional control, e.g. so a command menu can open the sheet. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const ALL = "__all__";

const parseNumber = (raw: string): number | undefined => {
  const n = raw.trim() === "" ? Number.NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** Settings shared by all models, with optional per-model overrides, in a side sheet. */
export default function SettingsPanel({ value, onChange, modelIds, className, open, onOpenChange }: Props) {
  const [tab, setTab] = useState<string>(ALL);
  const activeTab = tab === ALL || modelIds.includes(tab) ? tab : ALL;

  const isAll = activeTab === ALL;
  const current = isAll ? value.all : value.perModel[activeTab] ?? {};
  const inherited = cleanSettings(value.all);

  const overrideCount = modelIds.filter((id) => !isEmpty(value.perModel[id])).length;
  const summary =
    [describeSettings(cleanSettings(value.all)), overrideCount ? `${overrideCount} model override(s)` : ""]
      .filter(Boolean)
      .join(" · ") || "Provider defaults";

  const problems = [ALL, ...modelIds]
    .map((id) => settingsError(id === ALL ? value.all : value.perModel[id] ?? {}))
    .filter(Boolean);

  function update(patch: Partial<GenerationSettings>) {
    const next = { ...current, ...patch };
    if (isAll) onChange({ ...value, all: next });
    else onChange({ ...value, perModel: { ...value.perModel, [activeTab]: next } });
  }

  function resetOverride() {
    const perModel = { ...value.perModel };
    delete perModel[activeTab];
    onChange({ ...value, perModel });
  }

  const placeholder = (field: keyof GenerationSettings, fallback: string) =>
    !isAll && inherited[field] !== undefined ? `Same as all models (${inherited[field]})` : fallback;
  const error = settingsError(current);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("max-w-full gap-2 text-muted-foreground", className)}>
          <SlidersHorizontal className="size-4" />
          <span className="sr-only sm:not-sr-only sm:text-foreground">Generation settings</span>
          <span className={cn("truncate text-xs", problems.length ? "text-danger" : "text-muted-foreground")}>
            {problems.length ? problems[0] : summary}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Generation settings</SheetTitle>
          <SheetDescription>
            Empty fields use each provider&apos;s default. Saved with each comparison and restored on re-run.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-5 overflow-y-auto p-4">
          <div role="tablist" aria-label="Apply settings to" className="flex flex-wrap gap-1.5">
            {[ALL, ...modelIds].map((id) => {
              const selected = id === activeTab;
              const overridden = id !== ALL && !isEmpty(value.perModel[id]);
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    selected ? "border-foreground/30 bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {id !== ALL && <span aria-hidden className="size-2 rounded-full" style={{ background: modelColor(id) }} />}
                  {id === ALL ? "All models" : findModel(id)?.label ?? id}
                  {overridden ? " •" : ""}
                </button>
              );
            })}
          </div>

          {!isAll && (
            <p className="text-xs text-muted-foreground">
              Fields set here replace the shared value for this model only.{" "}
              {!isEmpty(current) && (
                <button type="button" onClick={resetOverride} className="text-brand underline-offset-2 hover:underline">
                  Reset to shared settings
                </button>
              )}
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="setting-system">System prompt</Label>
            <Textarea
              id="setting-system"
              rows={4}
              value={current.systemPrompt ?? ""}
              maxLength={L.systemPromptChars}
              placeholder={
                !isAll && inherited.systemPrompt
                  ? "Same as all models"
                  : "Optional instructions for every model, e.g. “Answer in three sentences.”"
              }
              onChange={(e) => update({ systemPrompt: e.target.value || undefined })}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="setting-temperature">Temperature</Label>
              <Input
                id="setting-temperature"
                type="number"
                inputMode="decimal"
                step={0.1}
                min={L.temperature.min}
                max={L.temperature.max}
                value={current.temperature ?? ""}
                placeholder={placeholder("temperature", "Default")}
                onChange={(e) => update({ temperature: parseNumber(e.target.value) })}
                className="tabular"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="setting-topp">Top-p</Label>
              <Input
                id="setting-topp"
                type="number"
                inputMode="decimal"
                step={0.05}
                min={L.topP.min}
                max={L.topP.max}
                value={current.topP ?? ""}
                placeholder={placeholder("topP", "Default")}
                onChange={(e) => update({ topP: parseNumber(e.target.value) })}
                className="tabular"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="setting-max">Max output tokens</Label>
              <Input
                id="setting-max"
                type="number"
                inputMode="numeric"
                step={1}
                min={L.maxOutputTokens.min}
                max={L.maxOutputTokens.max}
                value={current.maxOutputTokens ?? ""}
                placeholder={placeholder("maxOutputTokens", String(DEFAULT_MAX_OUTPUT_TOKENS))}
                onChange={(e) => update({ maxOutputTokens: parseNumber(e.target.value) })}
                className="tabular"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Reasoning models (such as GPT-5.4 Mini and Claude Sonnet 5.5) ignore temperature and top-p; their
            answer will say so.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
