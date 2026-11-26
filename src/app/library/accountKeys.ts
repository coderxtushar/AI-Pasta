import type { ProviderId, SavedKeyInfo } from "./providers";

// Browser helpers for /api/keys. The server only ever returns key hints.

async function errorFrom(res: Response): Promise<Error> {
  const data = await res.json().catch(() => null);
  return new Error(data?.error ?? `Server error ${res.status}`);
}

export async function saveKeyToAccount(provider: ProviderId, apiKey: string): Promise<SavedKeyInfo> {
  const res = await fetch("/api/keys", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()).key;
}

export async function removeKeyFromAccount(provider: ProviderId): Promise<void> {
  const res = await fetch(`/api/keys?provider=${encodeURIComponent(provider)}`, { method: "DELETE" });
  if (!res.ok) throw await errorFrom(res);
}

/** Replaces or adds `key` in a list of saved keys. */
export function upsertKey(keys: SavedKeyInfo[], key: SavedKeyInfo): SavedKeyInfo[] {
  return [...keys.filter((k) => k.provider !== key.provider), key];
}
