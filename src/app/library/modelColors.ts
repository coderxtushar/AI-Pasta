import { MODELS } from "./models";

/** CSS colour for a model: one steady hue per model, by registry order (see globals.css). */
export function modelColor(modelId: string): string {
  const index = MODELS.findIndex((m) => m.id === modelId);
  return index >= 0 ? `var(--model-${(index % 6) + 1})` : "var(--muted-foreground)";
}
