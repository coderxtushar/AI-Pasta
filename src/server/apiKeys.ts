import { and, eq } from "drizzle-orm";
import { isAuthConfigured } from "@/auth";
import type { ProviderId, SavedKeyInfo } from "@/app/library/providers";
import { db } from "./db";
import { apiKeys } from "./db/schema";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./crypto";
import { apiKeyContext } from "./apiKeyContext";

/** Account key storage needs both accounts and an encryption key. */
export function isKeyStorageEnabled(): boolean {
  return isAuthConfigured() && isEncryptionConfigured();
}

const context = apiKeyContext;

export async function saveApiKey(
  userId: string,
  provider: ProviderId,
  apiKey: string
): Promise<SavedKeyInfo> {
  const sealed = encryptSecret(apiKey, context(userId, provider));
  const values = { ...sealed, last4: apiKey.slice(-4), updatedAt: new Date() };
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, provider, ...values })
    .onConflictDoUpdate({ target: [apiKeys.userId, apiKeys.provider], set: values })
    .returning({ provider: apiKeys.provider, last4: apiKeys.last4, updatedAt: apiKeys.updatedAt });
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

export async function listApiKeys(userId: string): Promise<SavedKeyInfo[]> {
  const rows = await db
    .select({ provider: apiKeys.provider, last4: apiKeys.last4, updatedAt: apiKeys.updatedAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function deleteApiKey(userId: string, provider: ProviderId): Promise<void> {
  await db.delete(apiKeys).where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)));
}

export class KeyDecryptionError extends Error {}

/** Returns the plaintext key for server-side use only, or null if none is saved. */
export async function getDecryptedApiKey(userId: string, provider: ProviderId): Promise<string | null> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)))
    .limit(1);
  if (!row) return null;
  try {
    return decryptSecret(row, context(userId, provider));
  } catch {
    throw new KeyDecryptionError("Saved key could not be decrypted.");
  }
}
