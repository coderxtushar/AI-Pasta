import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearKeys, hasAnyKey, loadKeys, saveKeys } from "./keys";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("browser key storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("round-trips keys and trims whitespace", () => {
    saveKeys({ openai: " sk-1 " });
    expect(loadKeys()).toEqual({ openai: "sk-1" });
  });

  it("migrates the legacy gemini field to google", () => {
    localStorage.setItem("apiKeys", JSON.stringify({ gemini: "g-key", unknown: "x" }));
    expect(loadKeys()).toEqual({ google: "g-key" });
  });

  it("ignores empty values and broken JSON", () => {
    localStorage.setItem("apiKeys", JSON.stringify({ openai: "  " }));
    expect(hasAnyKey(loadKeys())).toBe(false);
    localStorage.setItem("apiKeys", "{not json");
    expect(loadKeys()).toEqual({});
  });

  it("clears keys", () => {
    saveKeys({ groq: "gsk" });
    clearKeys();
    expect(loadKeys()).toEqual({});
  });
});
