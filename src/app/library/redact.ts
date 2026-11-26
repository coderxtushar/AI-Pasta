// Common API key shapes (OpenAI/Anthropic/DeepSeek/Qwen "sk-…", Groq "gsk_…",
// Google "AIza…"). Providers sometimes echo part of the key in error messages.
const KEY_PATTERNS = [/\bsk-[A-Za-z0-9_\-*.]{3,}/g, /\bgsk_[A-Za-z0-9_\-*.]{3,}/g, /\bAIza[A-Za-z0-9_\-*.]{3,}/g];

/**
 * Makes an error message safe to log or report. Database errors include the
 * query parameters ("params: …"), which can be session tokens, prompts or
 * model output, so everything from there on is dropped.
 */
export function safeErrorMessage(messageOrError: unknown): string {
  const message =
    messageOrError instanceof Error ? messageOrError.message : String(messageOrError ?? "");
  return redactSecrets(message.replace(/\bparams:[\s\S]*$/, "params: [redacted]"));
}

/** Removes `apiKey` (if given) and anything key-shaped from a message. */
export function redactSecrets(message: string, apiKey?: string): string {
  let out = message;
  if (apiKey && apiKey.length >= 4) out = out.split(apiKey).join("[redacted]");
  for (const pattern of KEY_PATTERNS) out = out.replace(pattern, "[redacted]");
  return out;
}
