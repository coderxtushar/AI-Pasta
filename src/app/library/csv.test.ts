import { describe, expect, it } from "vitest";
import { RESULT_COLUMNS, resultRow, toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas, quotes, newlines and edge spaces", () => {
    const csv = toCsv(["a", "b", "c", "d"], [{ a: "x,y", b: 'say "hi"', c: "line1\nline2", d: " padded" }]);
    expect(csv).toBe('a,b,c,d\r\n"x,y","say ""hi""","line1\nline2"," padded"\r\n');
  });

  it("neutralizes spreadsheet formulas in text but not in numbers", () => {
    const csv = toCsv(["t", "n"], [
      { t: "=HYPERLINK(\"http://evil\")", n: -5 },
      { t: "+1", n: 0 },
      { t: "@SUM(A1)", n: null },
      { t: "-2", n: undefined },
    ]);
    expect(csv.split("\r\n").slice(1, 5)).toEqual([`"'=HYPERLINK(""http://evil"")",-5`, "'+1,0", "'@SUM(A1),", "'-2,"]);
  });

  it("writes empty cells for missing values", () => {
    expect(toCsv(["a", "b"], [{ a: "x" }])).toBe("a,b\r\nx,\r\n");
  });
});

describe("resultRow", () => {
  it("flattens a run into the export columns", () => {
    const row = resultRow({
      prompt: "Q",
      input: "in",
      modelId: "qwen-plus",
      state: {
        status: "done",
        text: "A",
        metrics: { ttftMs: 10, totalMs: 20, inputTokens: 3, outputTokens: 4, costUsd: 0.001, notes: ["n1", "n2"] },
      },
      settings: { temperature: 0.2 },
      judgeScores: ["DeepSeek Chat 9/10"],
      blindPick: true,
    });
    expect(Object.keys(row)).toEqual([...RESULT_COLUMNS]);
    expect(row).toMatchObject({
      model_label: "Qwen Plus",
      ttft_ms: 10,
      notes: "n1; n2",
      settings: "temperature 0.2",
      judge_scores: "DeepSeek Chat 9/10",
      blind_pick: "yes",
    });
  });
});
