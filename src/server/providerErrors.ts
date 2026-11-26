import { APICallError, RetryError } from "ai";
import { PROVIDERS, type ProviderId } from "@/app/library/providers";
import { redactSecrets } from "@/app/library/redact";

export { redactSecrets };

function detail(message: string, apiKey?: string): string {
  const clean = redactSecrets(message, apiKey).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return ` (${clean.length > 160 ? `${clean.slice(0, 157)}…` : clean})`;
}

const looksLikeKeyProblem = (message: string) => /api[\s_-]?key|unauthori[sz]ed|authenticat/i.test(message);

/**
 * Turns a provider failure into a message a user can act on. These messages are
 * saved with comparisons and can appear on public share pages, so they never
 * include the raw provider text for auth failures and always strip key-like strings.
 */
export function describeProviderError(
  error: unknown,
  provider: ProviderId,
  modelId: string,
  apiKey?: string
): string {
  const label = PROVIDERS[provider].label;
  const err = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(err)) {
    const status = err.statusCode ?? 0;
    if (status === 401 || status === 403 || (status === 400 && looksLikeKeyProblem(err.message))) {
      return `${label} rejected the API key. Check that it's correct, active, and has access to this model.`;
    }
    if (status === 404) {
      return `${label} doesn't recognize the model "${modelId}". It may have been renamed or retired.`;
    }
    if (status === 429) {
      return `${label} rate limit or quota reached. Wait a moment, or check your plan and billing.${detail(err.message, apiKey)}`;
    }
    if (status >= 500) {
      return `${label} is having problems right now (HTTP ${status}). Try again shortly.`;
    }
    return `${label} error${status ? ` (HTTP ${status})` : ""}${detail(err.message, apiKey)}`;
  }

  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message, apiKey);
}
