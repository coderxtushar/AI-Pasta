"use client";
import React, { useState } from "react";
import { PROVIDERS, PROVIDER_IDS, type ProviderId, type SavedKeyInfo } from "../library/providers";
import { removeKeyFromAccount, saveKeyToAccount, upsertKey } from "../library/accountKeys";

type Props = {
  keys: SavedKeyInfo[];
  onChange: (keys: SavedKeyInfo[]) => void;
};

const smallButton: React.CSSProperties = {
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 13,
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
    <div className="p-4 border rounded-xl space-y-3" style={{ background: "#fff" }}>
      <h3 style={{ margin: 0, fontWeight: 700 }}>API Keys</h3>

      <div style={{ display: "grid", gap: 10 }}>
        {PROVIDER_IDS.map((id) => {
          const key = saved.get(id);
          const showInput = !key || editing[id];
          return (
            <div key={id}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{PROVIDERS[id].label}</div>
              {showInput ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(id);
                  }}
                  style={{ display: "flex", gap: 6 }}
                >
                  <input
                    type="password"
                    autoComplete="off"
                    aria-label={`${PROVIDERS[id].label} key`}
                    placeholder={key ? "New key" : "Paste key"}
                    value={drafts[id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [id]: e.target.value }))}
                    className="border p-2 rounded"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button
                    type="submit"
                    disabled={busy === id || !drafts[id]?.trim()}
                    className="bg-blue-500 text-white"
                    style={smallButton}
                  >
                    Save
                  </button>
                  {key && (
                    <button
                      type="button"
                      onClick={() => setEditing((e) => ({ ...e, [id]: false }))}
                      className="bg-gray-200 text-gray-800"
                      style={smallButton}
                    >
                      Cancel
                    </button>
                  )}
                </form>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ flex: 1, fontFamily: "var(--font-geist-mono)", fontSize: 13, color: "#374151" }}>
                    ••••{key!.last4}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing((e) => ({ ...e, [id]: true }))}
                    className="bg-gray-200 text-gray-800"
                    style={smallButton}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    disabled={busy === id}
                    onClick={() => remove(id)}
                    className="bg-gray-200"
                    style={{ ...smallButton, color: "#b91c1c" }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <div style={{ fontSize: 13, color: message.error ? "#b91c1c" : "#374151" }}>{message.text}</div>
      )}

      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Keys are encrypted and stored in your account, so they work on any device. Once saved, a key is never
        shown again.
      </div>
    </div>
  );
}
