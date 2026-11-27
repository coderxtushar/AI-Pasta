"use client";
import React, { useState } from "react";
import { findModel } from "../library/models";
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
};

const ALL = "__all__";

const input: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontFamily: "inherit",
  fontSize: 14,
};

const parseNumber = (raw: string): number | undefined => {
  const n = raw.trim() === "" ? Number.NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** Collapsible settings: one set for all models, with optional per-model overrides. */
export default function SettingsPanel({ value, onChange, modelIds }: Props) {
  const [open, setOpen] = useState(false);
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

  return (
    <div style={{ marginBottom: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontWeight: 600 }}>Generation settings</span>
        <span style={{ fontSize: 13, color: problems.length ? "#b91c1c" : "#6b7280" }}>
          {problems.length ? problems[0] : summary} {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "4px 10px 12px", display: "grid", gap: 10 }}>
          <div role="tablist" aria-label="Apply settings to" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 13,
                    cursor: "pointer",
                    border: selected ? "1px solid #2563eb" : "1px solid #e5e7eb",
                    background: selected ? "#eef2ff" : "#fff",
                  }}
                >
                  {id === ALL ? "All models" : findModel(id)?.label ?? id}
                  {overridden ? " •" : ""}
                </button>
              );
            })}
          </div>

          {!isAll && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Fields set here replace the shared value for this model only.{" "}
              {!isEmpty(current) && (
                <button
                  type="button"
                  onClick={resetOverride}
                  style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", padding: 0 }}
                >
                  Reset to shared settings
                </button>
              )}
            </div>
          )}

          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>System prompt</span>
            <textarea
              rows={3}
              value={current.systemPrompt ?? ""}
              maxLength={L.systemPromptChars}
              placeholder={
                !isAll && inherited.systemPrompt
                  ? "Same as all models"
                  : "Optional instructions sent to every model, e.g. “Answer in three sentences.”"
              }
              onChange={(e) => update({ systemPrompt: e.target.value || undefined })}
              style={input}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Temperature</span>
              <input
                type="number"
                inputMode="decimal"
                step={0.1}
                min={L.temperature.min}
                max={L.temperature.max}
                value={current.temperature ?? ""}
                placeholder={placeholder("temperature", "Default")}
                onChange={(e) => update({ temperature: parseNumber(e.target.value) })}
                style={input}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Top-p</span>
              <input
                type="number"
                inputMode="decimal"
                step={0.05}
                min={L.topP.min}
                max={L.topP.max}
                value={current.topP ?? ""}
                placeholder={placeholder("topP", "Default")}
                onChange={(e) => update({ topP: parseNumber(e.target.value) })}
                style={input}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Max output tokens</span>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                min={L.maxOutputTokens.min}
                max={L.maxOutputTokens.max}
                value={current.maxOutputTokens ?? ""}
                placeholder={placeholder("maxOutputTokens", String(DEFAULT_MAX_OUTPUT_TOKENS))}
                onChange={(e) => update({ maxOutputTokens: parseNumber(e.target.value) })}
                style={input}
              />
            </label>
          </div>

          {settingsError(current) && (
            <div role="alert" style={{ fontSize: 13, color: "#b91c1c" }}>
              {settingsError(current)}
            </div>
          )}
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Empty fields use each provider&apos;s default. Reasoning models may ignore temperature and top-p; their
            answer will say so.
          </div>
        </div>
      )}
    </div>
  );
}
