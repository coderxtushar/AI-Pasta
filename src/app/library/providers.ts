export type ProviderId = "openai" | "anthropic" | "google" | "deepseek" | "groq" | "qwen";

export type ProviderInfo = {
  label: string;
};

// Client-safe metadata. SDK wiring lives in src/server/llm.ts.
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: { label: "OpenAI" },
  anthropic: { label: "Anthropic" },
  google: { label: "Gemini" },
  deepseek: { label: "DeepSeek" },
  groq: { label: "Groq" },
  qwen: { label: "Qwen" },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export type ApiKeys = Partial<Record<ProviderId, string>>;
