"use client";
import React, { useEffect, useState } from "react";

type Keys = {
  openai?: string;
  anthropic?: string;
  gemini?: string;
  deepseek?: string;
  groq?: string;
  qwen?: string;
};

const STORAGE_KEY = "apiKeys";

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<Keys>({
    openai: "",
    anthropic: "",
    gemini: "",
    deepseek: "",
    groq: "",
    qwen: "",
  });
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setKeys((k) => ({ ...k, ...(parsed || {}) }));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
      setStatus("Saved");
      setTimeout(() => setStatus(null), 2000);
    } catch {
      setStatus("Save failed");
      setTimeout(() => setStatus(null), 2000);
    }
  };

  const clearKeys = () => {
    localStorage.removeItem(STORAGE_KEY);
    setKeys({ openai: "", anthropic: "", gemini: "", deepseek: "", groq: "", qwen: "" });
    setStatus("Cleared");
    setTimeout(() => setStatus(null), 2000);
  };

  const onChange = (field: keyof Keys, value: string) => {
    setKeys((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="p-4 border rounded-xl space-y-3" style={{ background: "#fff" }}>
      <h3 style={{ margin: 0, fontWeight: 700 }}>API Keys</h3>

      <div>
        <input
          type="password"
          placeholder="OpenAI Key"
          value={keys.openai}
          onChange={(e) => onChange("openai", e.target.value)}
          className="border p-2 rounded w-full"
          style={{ width: "100%", marginBottom: 8 }}
        />
        <input
          type="password"
          placeholder="Anthropic Key"
          value={keys.anthropic}
          onChange={(e) => onChange("anthropic", e.target.value)}
          className="border p-2 rounded w-full"
          style={{ width: "100%", marginBottom: 8 }}
        />
        <input
          type="password"
          placeholder="Gemini Key"
          value={keys.gemini}
          onChange={(e) => onChange("gemini", e.target.value)}
          className="border p-2 rounded w-full"
          style={{ width: "100%", marginBottom: 8 }}
        />
        <input
          type="password"
          placeholder="DeepSeek Key"
          value={keys.deepseek}
          onChange={(e) => onChange("deepseek", e.target.value)}
          className="border p-2 rounded w-full"
          style={{ width: "100%", marginBottom: 8 }}
        />
        <input
          type="password"
          placeholder="Groq Key"
          value={keys.groq}
          onChange={(e) => onChange("groq", e.target.value)}
          className="border p-2 rounded w-full"
          style={{ width: "100%", marginBottom: 8 }}
        />
        <input
          type="password"
          placeholder="Qwen Key"
          value={keys.qwen}
          onChange={(e) => onChange("qwen", e.target.value)}
          className="border p-2 rounded w-full"
          style={{ width: "100%" }}
        />
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
          onClick={clearKeys}
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
        Keys are stored in localStorage under "{STORAGE_KEY}". They are sent to /api/compare when you submit.
      </div>
    </div>
  );
}