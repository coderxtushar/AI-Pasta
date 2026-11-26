export type ProviderId = "openai" | "anthropic" | "google" | "deepseek" | "groq" | "qwen";

export type ProviderInfo = {
  label: string;
  /** Base URL for OpenAI-compatible APIs. Unset means the provider's own SDK default. */
  baseURL?: string;
};

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: { label: "OpenAI" },
  anthropic: { label: "Anthropic" },
  google: {
    label: "Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  deepseek: { label: "DeepSeek", baseURL: "https://api.deepseek.com" },
  groq: { label: "Groq", baseURL: "https://api.groq.com/openai/v1" },
  qwen: {
    label: "Qwen",
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export type ApiKeys = Partial<Record<ProviderId, string>>;
