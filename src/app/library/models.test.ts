import { describe, expect, it } from "vitest";
import { MODELS, estimateCostUsd, findModel } from "./models";
import { PROVIDER_IDS } from "./providers";

describe("model registry", () => {
  it("has unique IDs and known providers", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODELS) expect(PROVIDER_IDS).toContain(m.provider);
  });

  it("finds models by ID", () => {
    expect(findModel("gpt-5.4-mini")?.provider).toBe("openai");
    expect(findModel("nope")).toBeUndefined();
  });
});

describe("estimateCostUsd", () => {
  const priced = { id: "x", label: "X", provider: "openai" as const, pricing: { inputPerMTok: 2, outputPerMTok: 10 } };

  it("prices input and output tokens per million", () => {
    expect(estimateCostUsd(priced, 1_000_000, 0)).toBe(2);
    expect(estimateCostUsd(priced, 500, 200)).toBeCloseTo(0.003);
  });

  it("returns undefined when price or usage is unknown", () => {
    expect(estimateCostUsd({ ...priced, pricing: undefined }, 10, 10)).toBeUndefined();
    expect(estimateCostUsd(priced, undefined, 10)).toBeUndefined();
  });
});
