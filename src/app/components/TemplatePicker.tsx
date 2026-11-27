"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  MAX_TEMPLATE_NAME,
  accountTemplateStore,
  browserTemplateStore,
  type Template,
} from "../library/templates";
import { BookmarkIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  /** Signed-in users keep templates in their account; others in this browser. */
  signedIn: boolean;
  /** The prompt "Save as template" stores. */
  prompt: string;
  onLoad: (prompt: string) => void;
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
    <div className="grid gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <BookmarkIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="Templates"
            value={selectedId}
            onChange={(e) => load(e.target.value)}
            className="h-8 max-w-56 appearance-none truncate rounded-md border bg-transparent pr-7 pl-8 text-xs text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{templates.length ? "Load a template…" : "No templates yet"}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          disabled={!prompt.trim()}
          onClick={() => {
            setNaming(true);
            setName(selected?.name ?? "");
          }}
        >
          Save as template
        </Button>
        {selected && (
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-danger hover:text-danger" onClick={remove}>
            Delete template
          </Button>
        )}
      </div>

      {naming && (
        // Not a <form>: this can sit inside the compare form, and nested forms aren't valid HTML.
        <div role="group" aria-label="Save template" className="flex gap-1.5">
          <Input
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
              if (e.key === "Escape") setNaming(false);
            }}
            className="h-8 flex-1 text-sm"
          />
          <Button type="button" size="sm" disabled={!name.trim()} onClick={save}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>
            Cancel
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className={message.error ? "text-xs text-danger" : "text-xs text-muted-foreground"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
