import { describe, expect, it } from "vitest";
import { cleanSettings, compactSettings, describeSettings, effectiveSettings, isEmpty, settingsError } from "./settings";

describe("settings", () => {
  it("drops unset values and blank system prompts", () => {
    expect(cleanSettings({ systemPrompt: "  ", temperature: undefined, topP: 0.5 })).toEqual({ topP: 0.5 });
    expect(cleanSettings({ temperature: Number.NaN })).toEqual({});
    expect(isEmpty({ systemPrompt: "" })).toBe(true);
    expect(isEmpty({ temperature: 0 })).toBe(false); // 0 is a real value
  });

  it("layers per-model overrides on top of the shared settings", () => {
    const s = {
      all: { systemPrompt: "Be brief.", temperature: 0.2, maxOutputTokens: 1000 },
      perModel: { "claude-sonnet-5-5": { temperature: 0.9, systemPrompt: "" } },
    };
    expect(effectiveSettings(s, "claude-sonnet-5-5")).toEqual({
      systemPrompt: "Be brief.",
      temperature: 0.9,
      maxOutputTokens: 1000,
    });
    expect(effectiveSettings(s, "gpt-5.4-mini")).toEqual(s.all);
    expect(effectiveSettings(null, "x")).toEqual({});
  });

  it("compacts away empty overrides and unselected models", () => {
    const s = { all: { temperature: 1 }, perModel: { a: { topP: 0.3 }, b: {}, c: { topP: 0.1 } } };
    expect(compactSettings(s, ["a", "b"])).toEqual({ all: { temperature: 1 }, perModel: { a: { topP: 0.3 } } });
  });

  it("describes settings briefly", () => {
    expect(describeSettings({ systemPrompt: "x", temperature: 0, topP: 0.9, maxOutputTokens: 512 })).toBe(
      "system prompt · temperature 0 · top-p 0.9 · max 512 tokens"
    );
    expect(describeSettings({})).toBe("");
  });

  it("validates like the server", () => {
    expect(settingsError({ temperature: 2, topP: 0, maxOutputTokens: 16 })).toBeNull();
    expect(settingsError({ temperature: 2.1 })).toBe("Temperature must be between 0 and 2.");
    expect(settingsError({ topP: 1.5 })).toBe("Top-p must be between 0 and 1.");
    expect(settingsError({ maxOutputTokens: 100.5 })).toBe("Max tokens must be a whole number.");
    expect(settingsError({ maxOutputTokens: 99_999 })).toBe("Max tokens must be between 16 and 32768.");
    expect(settingsError({ systemPrompt: "x".repeat(10_001) })).toContain("System prompt");
  });
});
