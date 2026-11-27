"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  MAX_TEMPLATE_NAME,
  accountTemplateStore,
  browserTemplateStore,
  type Template,
} from "../library/templates";

type Props = {
  /** Signed-in users keep templates in their account; others in this browser. */
  signedIn: boolean;
  /** The prompt "Save as template" stores. */
  prompt: string;
  onLoad: (prompt: string) => void;
};

const small: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

export default function TemplatePicker({ signedIn, prompt, onLoad }: Props) {
  const store = useMemo(() => (signedIn ? accountTemplateStore : browserTemplateStore), [signedIn]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    store
      .list()
      .then(setTemplates)
      .catch((e) => setMessage({ text: `Couldn't load templates: ${e.message}`, error: true }));
  }, [store]);

  const selected = templates.find((t) => t.id === selectedId);

  function load(id: string) {
    setSelectedId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      onLoad(t.prompt);
      setMessage(null);
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const saved = await store.save(trimmed, prompt);
      setTemplates((all) => [...all.filter((t) => t.name !== saved.name), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedId(saved.id);
      setNaming(false);
      setName("");
      setMessage({ text: `Saved template “${saved.name}”.`, error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Save failed.", error: true });
    }
  }

  async function remove() {
    if (!selected) return;
    try {
      await store.remove(selected.id);
      setTemplates((all) => all.filter((t) => t.id !== selected.id));
      setSelectedId("");
      setMessage({ text: `Deleted template “${selected.name}”.`, error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Delete failed.", error: true });
    }
  }

  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8, fontSize: 13 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          aria-label="Templates"
          value={selectedId}
          onChange={(e) => load(e.target.value)}
          style={{ padding: 5, borderRadius: 6, border: "1px solid #d1d5db", maxWidth: 260 }}
        >
          <option value="">{templates.length ? "Load a template…" : "No templates yet"}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          style={small}
          disabled={!prompt.trim()}
          onClick={() => {
            setNaming(true);
            setName(selected?.name ?? "");
          }}
        >
          Save as template
        </button>
        {selected && (
          <button type="button" style={{ ...small, color: "#b91c1c" }} onClick={remove}>
            Delete template
          </button>
        )}
        <span style={{ color: "#6b7280" }}>
          Use <code>{"{{input}}"}</code> to fill in a value on the Batch page.
        </span>
      </div>

      {naming && (
        // Not a <form>: this sits inside the compare form, and nested forms aren't valid HTML.
        <div role="group" aria-label="Save template" style={{ display: "flex", gap: 6 }}>
          <input
            aria-label="Template name"
            autoFocus
            value={name}
            maxLength={MAX_TEMPLATE_NAME}
            placeholder="Template name (same name replaces it)"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // don't submit the surrounding compare form
                save();
              }
            }}
            style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid #d1d5db" }}
          />
          <button type="button" style={small} disabled={!name.trim()} onClick={save}>
            Save
          </button>
          <button type="button" style={small} onClick={() => setNaming(false)}>
            Cancel
          </button>
        </div>
      )}
      {message && <div style={{ color: message.error ? "#b91c1c" : "#374151" }}>{message.text}</div>}
    </div>
  );
}
