import type { LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelInfo } from "@/app/library/models";

// Alibaba issues region-specific keys. Default is Singapore (international);
// set QWEN_BASE_URL for US (dashscope-us) or China (dashscope) endpoints.
const QWEN_BASE_URL =
  process.env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/** Builds an AI SDK model for a registry entry, using the caller's API key. */
export function getLanguageModel(model: ModelInfo, apiKey: string): LanguageModel {
  switch (model.provider) {
    case "openai":
      return createOpenAI({ apiKey })(model.id);
    case "anthropic":
      return createAnthropic({ apiKey })(model.id);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model.id);
    case "deepseek":
      // DEEPSEEK_BASE_URL is optional (a proxy, or the mock in end-to-end tests).
      return createDeepSeek({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || undefined })(model.id);
    case "groq":
      return createGroq({ apiKey })(model.id);
    case "qwen":
      return createOpenAICompatible({
        name: "qwen",
        apiKey,
        baseURL: QWEN_BASE_URL,
        includeUsage: true,
      })(model.id);
  }
}
