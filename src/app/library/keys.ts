import { PROVIDER_IDS, type ApiKeys } from "./providers";

const STORAGE_KEY = "apiKeys";

/** Reads saved keys from localStorage. Migrates the old "gemini" field to "google". */
export function loadKeys(): ApiKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: Record<string, unknown> = JSON.parse(raw) ?? {};
    if (parsed.gemini && !parsed.google) parsed.google = parsed.gemini;
    const keys: ApiKeys = {};
    for (const id of PROVIDER_IDS) {
      const value = parsed[id];
      if (typeof value === "string" && value.trim()) keys[id] = value.trim();
    }
    return keys;
  } catch {
    return {};
  }
}

export function saveKeys(keys: ApiKeys): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function clearKeys(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasAnyKey(keys: ApiKeys): boolean {
  return Object.values(keys).some((k) => !!k?.trim());
}
