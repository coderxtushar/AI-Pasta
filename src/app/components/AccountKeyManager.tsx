"use client";
import React, { useState } from "react";
import { PROVIDERS, PROVIDER_IDS, type ProviderId, type SavedKeyInfo } from "../library/providers";
import { removeKeyFromAccount, saveKeyToAccount, upsertKey } from "../library/accountKeys";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  keys: SavedKeyInfo[];
  onChange: (keys: SavedKeyInfo[]) => void;
};


/** Manages keys saved (encrypted) to the signed-in user's account. */
export default function AccountKeyManager({ keys, onChange }: Props) {
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [editing, setEditing] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const saved = new Map(keys.map((k) => [k.provider, k]));

  async function save(provider: ProviderId) {
    const value = drafts[provider]?.trim();
    if (!value) return;
    setBusy(provider);
    setMessage(null);
    try {
      const key = await saveKeyToAccount(provider, value);
      onChange(upsertKey(keys, key));
      setDrafts((d) => ({ ...d, [provider]: "" }));
      setEditing((e) => ({ ...e, [provider]: false }));
      setMessage({ text: `${PROVIDERS[provider].label} key saved.`, error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Save failed.", error: true });
    } finally {
      setBusy(null);
    }
  }

  async function remove(provider: ProviderId) {
    setBusy(provider);
    setMessage(null);
    try {
      await removeKeyFromAccount(provider);
      onChange(keys.filter((k) => k.provider !== provider));
      setMessage({ text: `${PROVIDERS[provider].label} key removed.`, error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Remove failed.", error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {PROVIDER_IDS.map((id) => {
          const key = saved.get(id);
          const showInput = !key || editing[id];
          const label = PROVIDERS[id].label;
          return (
            <div key={id} className="grid gap-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{label}</span>
                {key && !editing[id] && (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Lock className="size-3" aria-hidden /> saved
                  </span>
                )}
              </div>
              {showInput ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    save(id);
                  }}
                  className="flex gap-1.5"
                >
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={`${label} key`}
                    placeholder={key ? "New key" : "Paste key"}
                    value={drafts[id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                    className="min-w-0 flex-1 font-mono text-[13px]"
                  />
                  <Button type="submit" size="sm" disabled={busy === id || !drafts[id]?.trim()}>
                    Save
                  </Button>
                  {key && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing((e) => ({ ...e, [id]: false }))}>
                      Cancel
                    </Button>
                  )}
                </form>
              ) : (
                <div className="flex h-9 items-center gap-1.5 rounded-md border bg-subtle px-3">
                  <span className="flex-1 font-mono text-[13px] text-muted-foreground">••••{key!.last4}</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setEditing((e) => ({ ...e, [id]: true }))}
                    aria-label={`Replace ${label} key`}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={busy === id}
                    onClick={() => remove(id)}
                    aria-label={`Remove ${label} key`}
                    className="text-danger hover:text-danger"
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <p role="status" className={message.error ? "text-sm text-danger" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Keys are encrypted and stored in your account, so they work on any device. Once saved, a key is never
        shown again.
      </p>
    </div>
  );
}
