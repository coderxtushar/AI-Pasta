import { describe, expect, it } from "vitest";
import { buildHistory, normalizeMessages } from "./conversation";

describe("buildHistory", () => {
  it("interleaves the user's turns with this model's answers", () => {
    expect(buildHistory(["Q1", "Q2", "Q3"], ["A1", "A2"])).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
      { role: "assistant", content: "A2" },
      { role: "user", content: "Q3" },
    ]);
  });

  it("keeps a failed turn's question but no empty answer", () => {
    expect(buildHistory(["Q1", "Q2"], ["", undefined])).toEqual([
      { role: "user", content: "Q1" },
      { role: "user", content: "Q2" },
    ]);
  });
});

describe("normalizeMessages", () => {
  it("merges back-to-back messages from the same role and drops empty ones", () => {
    expect(
      normalizeMessages([
        { role: "user", content: "Q1" },
        { role: "assistant", content: "  " },
        { role: "user", content: "Q2" },
        { role: "assistant", content: "A2" },
      ])
    ).toEqual([
      { role: "user", content: "Q1\n\nQ2" },
      { role: "assistant", content: "A2" },
    ]);
  });

  it("doesn't mutate the input", () => {
    const input = [
      { role: "user" as const, content: "a" },
      { role: "user" as const, content: "b" },
    ];
    normalizeMessages(input);
    expect(input[0].content).toBe("a");
  });
});
