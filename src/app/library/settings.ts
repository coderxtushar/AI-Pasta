// Generation settings: one set for all models, plus optional per-model overrides.
// Client-safe (no zod here, to keep it out of the browser bundle; the server
// validates with src/server/settingsSchema.ts).

export type GenerationSettings = {
  systemPrompt?: string;
  /** 0–2. Unset means the provider's default. */
  temperature?: number;
  /** 0–1. Unset means the provider's default. */
  topP?: number;
  /** Unset means DEFAULT_MAX_OUTPUT_TOKENS. */
  maxOutputTokens?: number;
};

export type ComparisonSettings = {
  all: GenerationSettings;
  /** Keyed by model ID. Fields set here replace the "all" value for that model. */
  perModel: Record<string, GenerationSettings>;
};

export const SETTINGS_LIMITS = {
  systemPromptChars: 10_000,
  temperature: { min: 0, max: 2 },
  topP: { min: 0, max: 1 },
  maxOutputTokens: { min: 16, max: 32_768 },
} as const;

// Reasoning models spend part of this budget thinking, so keep it generous.
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

export const EMPTY_SETTINGS: ComparisonSettings = { all: {}, perModel: {} };

/** Drops unset values and blank system prompts. */
export function cleanSettings(s: GenerationSettings | undefined): GenerationSettings {
  const out: GenerationSettings = {};
  if (s?.systemPrompt?.trim()) out.systemPrompt = s.systemPrompt;
  if (typeof s?.temperature === "number" && Number.isFinite(s.temperature)) out.temperature = s.temperature;
  if (typeof s?.topP === "number" && Number.isFinite(s.topP)) out.topP = s.topP;
  if (typeof s?.maxOutputTokens === "number" && Number.isFinite(s.maxOutputTokens)) {
    out.maxOutputTokens = s.maxOutputTokens;
  }
  return out;
}

export function isEmpty(s: GenerationSettings | undefined): boolean {
  return Object.keys(cleanSettings(s)).length === 0;
}

/** The settings one model actually runs with: "all", then its overrides on top. */
export function effectiveSettings(
  settings: ComparisonSettings | null | undefined,
  modelId: string
): GenerationSettings {
  return { ...cleanSettings(settings?.all), ...cleanSettings(settings?.perModel[modelId]) };
}

/** Removes empty overrides and overrides for models that aren't in `modelIds`. */
export function compactSettings(settings: ComparisonSettings, modelIds?: string[]): ComparisonSettings {
  const perModel: Record<string, GenerationSettings> = {};
  for (const [id, s] of Object.entries(settings.perModel)) {
    if (modelIds && !modelIds.includes(id)) continue;
    const clean = cleanSettings(s);
    if (Object.keys(clean).length) perModel[id] = clean;
  }
  return { all: cleanSettings(settings.all), perModel };
}

/** Short summary, e.g. "system prompt · temperature 0.2 · max 2048 tokens". */
export function describeSettings(s: GenerationSettings): string {
  const parts: string[] = [];
  if (s.systemPrompt) parts.push("system prompt");
  if (s.temperature !== undefined) parts.push(`temperature ${s.temperature}`);
  if (s.topP !== undefined) parts.push(`top-p ${s.topP}`);
  if (s.maxOutputTokens !== undefined) parts.push(`max ${s.maxOutputTokens} tokens`);
  return parts.join(" · ");
}

/** Client-side check matching the server's rules; returns the first problem or null. */
export function settingsError(s: GenerationSettings): string | null {
  const L = SETTINGS_LIMITS;
  if (s.systemPrompt && s.systemPrompt.length > L.systemPromptChars) {
    return `System prompt must be at most ${L.systemPromptChars} characters.`;
  }
  if (s.temperature !== undefined && (s.temperature < L.temperature.min || s.temperature > L.temperature.max)) {
    return `Temperature must be between ${L.temperature.min} and ${L.temperature.max}.`;
  }
  if (s.topP !== undefined && (s.topP < L.topP.min || s.topP > L.topP.max)) {
    return `Top-p must be between ${L.topP.min} and ${L.topP.max}.`;
  }
  if (s.maxOutputTokens !== undefined) {
    if (!Number.isInteger(s.maxOutputTokens)) return "Max tokens must be a whole number.";
    if (s.maxOutputTokens < L.maxOutputTokens.min || s.maxOutputTokens > L.maxOutputTokens.max) {
      return `Max tokens must be between ${L.maxOutputTokens.min} and ${L.maxOutputTokens.max}.`;
    }
  }
  return null;
}
