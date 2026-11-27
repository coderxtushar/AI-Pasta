import { PROVIDERS, type ProviderId } from "@/app/library/providers";
import { getDecryptedApiKey, isKeyStorageEnabled, KeyDecryptionError } from "./apiKeys";

export type ResolvedKey =
  | { apiKey: string; source: "browser" | "account" }
  | { error: string; status: number };

/**
 * The key for one provider call: the browser-held key if the request sent one,
 * otherwise the key saved (encrypted) to the signed-in account.
 */
export async function resolveApiKey(
  provided: string | undefined,
  userId: string | null,
  provider: ProviderId
): Promise<ResolvedKey> {
  if (provided) return { apiKey: provided, source: "browser" };

  const label = PROVIDERS[provider].label;
  if (!userId || !isKeyStorageEnabled()) return { error: "`apiKey` is required.", status: 400 };

  let apiKey: string | null;
  try {
    apiKey = await getDecryptedApiKey(userId, provider);
  } catch (e) {
    if (!(e instanceof KeyDecryptionError)) throw e;
    return { error: `Your saved ${label} key can't be read anymore. Please save it again.`, status: 409 };
  }
  if (!apiKey) return { error: `No ${label} API key saved to your account.`, status: 400 };
  return { apiKey, source: "account" };
}
