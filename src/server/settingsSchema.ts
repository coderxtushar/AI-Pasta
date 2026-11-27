import { z } from "zod";
import { SETTINGS_LIMITS as L } from "@/app/library/settings";
import { findModel } from "@/app/library/models";

export const GenerationSettingsSchema = z
  .object({
    systemPrompt: z
      .string()
      .max(L.systemPromptChars, `System prompt must be at most ${L.systemPromptChars} characters.`)
      .optional(),
    temperature: z
      .number()
      .min(L.temperature.min, `Temperature must be between ${L.temperature.min} and ${L.temperature.max}.`)
      .max(L.temperature.max, `Temperature must be between ${L.temperature.min} and ${L.temperature.max}.`)
      .optional(),
    topP: z
      .number()
      .min(L.topP.min, `Top-p must be between ${L.topP.min} and ${L.topP.max}.`)
      .max(L.topP.max, `Top-p must be between ${L.topP.min} and ${L.topP.max}.`)
      .optional(),
    maxOutputTokens: z
      .number()
      .int("Max tokens must be a whole number.")
      .min(L.maxOutputTokens.min, `Max tokens must be between ${L.maxOutputTokens.min} and ${L.maxOutputTokens.max}.`)
      .max(L.maxOutputTokens.max, `Max tokens must be between ${L.maxOutputTokens.min} and ${L.maxOutputTokens.max}.`)
      .optional(),
  })
  .strict();

export const ComparisonSettingsSchema = z
  .object({
    all: GenerationSettingsSchema,
    perModel: z.record(
      z.string().refine((id) => findModel(id) !== undefined, "Unknown model in settings."),
      GenerationSettingsSchema
    ),
  })
  .strict();
