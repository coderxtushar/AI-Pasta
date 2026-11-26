import type { ProviderId } from "./providers";

export type ModelPricing = {
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens (reasoning tokens are billed as output). */
  outputPerMTok: number;
};

export type ModelInfo = {
  /** Exact model ID sent to the provider's API. */
  id: string;
  label: string;
  provider: ProviderId;
  /** Public list price. Left unset when not confirmed, so no cost is shown. */
  pricing?: ModelPricing;
};

// Prices last checked 2026-11-26. Aliases like gemini-flash-latest have no
// fixed price because the model behind them changes.
export const MODELS: ModelInfo[] = [
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    provider: "openai",
    pricing: { inputPerMTok: 0.75, outputPerMTok: 4.5 },
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    provider: "anthropic",
    pricing: { inputPerMTok: 2, outputPerMTok: 10 },
  },
  { id: "gemini-flash-latest", label: "Gemini Flash", provider: "google" },
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: "deepseek" },
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Groq)",
    provider: "groq",
    pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  },
  { id: "qwen-plus", label: "Qwen Plus", provider: "qwen" },
];

export function findModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

export function estimateCostUsd(
  model: ModelInfo,
  inputTokens: number | undefined,
  outputTokens: number | undefined
): number | undefined {
  if (!model.pricing || inputTokens === undefined || outputTokens === undefined) return undefined;
  return (
    (inputTokens * model.pricing.inputPerMTok + outputTokens * model.pricing.outputPerMTok) / 1_000_000
  );
}
