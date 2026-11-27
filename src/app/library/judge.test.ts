import { describe, expect, it } from "vitest";
import { buildJudgePrompt, relabel } from "./judge";

describe("buildJudgePrompt", () => {
  it("includes the rubric, the request and every answer by letter only", () => {
    const text = buildJudgePrompt("What is 2+2?", [{ letter: "A", text: "4" }, { letter: "B", text: "5" }], "Be strict.");
    expect(text).toContain("Rubric: Be strict.");
    expect(text).toContain("<request>\nWhat is 2+2?\n</request>");
    expect(text).toContain('<answer id="A">\n4\n</answer>');
    expect(text).toContain('<answer id="B">\n5\n</answer>');
    expect(text).toContain('"winner":"A" or "tie"');
  });
});

describe("relabel", () => {
  const labels = { A: "qwen-plus", B: "deepseek-chat" };
  const names: Record<string, string> = { "qwen-plus": "Qwen Plus", "deepseek-chat": "DeepSeek Chat" };

  it("replaces the judge's letters with the names the user sees", () => {
    expect(relabel("Answer B is clearer than answer A.", labels, (id) => names[id])).toBe(
      "DeepSeek Chat is clearer than Qwen Plus."
    );
  });

  it("leaves unknown letters and unrelated words alone", () => {
    expect(relabel("Answer C and Answers A", labels, (id) => names[id])).toBe("Answer C and Answers A");
  });
});
