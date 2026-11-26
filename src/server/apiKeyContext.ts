import type { ProviderId } from "@/app/library/providers";

/**
 * Authenticated data bound to each encrypted API key. A row copied to another
 * user or provider fails to decrypt.
 */
export const apiKeyContext = (userId: string, provider: ProviderId) => `api_key:${userId}:${provider}`;
