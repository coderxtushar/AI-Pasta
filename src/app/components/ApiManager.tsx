"use client";
import React, { useEffect, useState } from "react";
import { PROVIDERS, PROVIDER_IDS, type ApiKeys, type ProviderId } from "../library/providers";
import { clearKeys, loadKeys, saveKeys } from "../library/keys";

type Props = {
  /** Called with the current keys after a save or clear. */
  onChange?: (keys: ApiKeys) => void;
};

export default function ApiKeyManager({ onChange }: Props) {
  const [keys, setKeys] = useState<ApiKeys>({});
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setKeys(loadKeys());
  }, []);

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 2000);
  };

  const save = () => {
    try {
      saveKeys(keys);
      onChange?.(loadKeys());
      flash("Saved");
    } catch {
      flash("Save failed");
    }
  };

  const clear = () => {
    clearKeys();
    setKeys({});
    onChange?.({});
    flash("Cleared");
  };

  const update = (provider: ProviderId, value: string) => {
    setKeys((prev) => ({ ...prev, [provider]: value }));
  };

  return (
    <div className="p-4 border rounded-xl space-y-3" style={{ background: "#fff" }}>
      <h3 style={{ margin: 0, fontWeight: 700 }}>API Keys</h3>

      <div>
        {PROVIDER_IDS.map((id) => (
          <input
            key={id}
            type="password"
            autoComplete="off"
            placeholder={`${PROVIDERS[id].label} Key`}
            value={keys[id] ?? ""}
            onChange={(e) => update(id, e.target.value)}
            className="border p-2 rounded w-full"
            style={{ width: "100%", marginBottom: 8 }}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={save}
          className="bg-blue-500 text-white px-3 py-1 rounded"
          style={{ border: "none", cursor: "pointer" }}
        >
          Save
        </button>
        <button
          onClick={clear}
          className="bg-gray-200 text-gray-800 px-3 py-1 rounded"
          style={{ border: "none", cursor: "pointer" }}
        >
          Clear Keys
        </button>
        {status && (
          <div style={{ alignSelf: "center", color: "#374151", fontSize: 13 }}>{status}</div>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
        Keys are stored in this browser&apos;s localStorage and sent with each comparison request.
      </div>
    </div>
  );
}
