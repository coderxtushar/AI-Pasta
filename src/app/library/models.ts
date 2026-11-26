import type { ProviderId } from "./providers";

export type ModelInfo = {
  /** Exact model ID sent to the provider's API. */
  id: string;
  label: string;
  provider: ProviderId;
};

export const MODELS: ModelInfo[] = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic" },
  { id: "gemini-flash-latest", label: "Gemini Flash", provider: "google" },
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: "deepseek" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (Groq)", provider: "groq" },
  { id: "qwen-plus", label: "Qwen Plus", provider: "qwen" },
];

export function findModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}
