// Remembers the last generation settings in this browser (shared by Compare and Batch).
import type { ComparisonSettings } from "./settings";

const KEY = "generationSettings";

export function loadStoredSettings(): ComparisonSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.all === "object" && typeof parsed.perModel === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function storeSettings(settings: ComparisonSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); settings still apply to this session.
  }
}
