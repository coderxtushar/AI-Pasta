// LLM-as-judge: types and pure helpers (client-safe).

export const DEFAULT_RUBRIC =
  "Score each answer from 1 to 10 for how well it serves the user: correctness first, then " +
  "completeness, clarity and concision. Penalize made-up facts. Ignore length unless it hurts clarity.";

export const MAX_RUBRIC_CHARS = 4_000;

export type JudgeScore = { score: number; reasoning: string };

export type JudgeVerdict = {
  judgeModelId: string;
  rubric: string;
  /** Scores keyed by the judged model's ID. */
  scores: Record<string, JudgeScore>;
  /** Null when the judge called it a tie. */
  winnerModelId: string | null;
  summary: string;
  /** The letters the judge saw ("A", "B"…) mapped to model IDs, to translate its text. */
  labels: Record<string, string>;
  metrics: { totalMs: number; inputTokens?: number; outputTokens?: number; costUsd?: number };
};

/** Letter for position `index` in the judge's (shuffled) order. */
export const judgeLetter = (index: number) => String.fromCharCode(65 + index);

/** Builds the judge's prompt. `answers` must already be in the order the judge should see. */
export function buildJudgePrompt(prompt: string, answers: { letter: string; text: string }[], rubric: string): string {
  const blocks = answers.map((a) => `<answer id="${a.letter}">\n${a.text}\n</answer>`).join("\n\n");
  return [
    "You are an impartial judge comparing answers from different AI assistants to the same request.",
    "The answers are labeled only by letter. Judge the content, not the order they appear in.",
    "",
    `Rubric: ${rubric}`,
    "",
    `<request>\n${prompt}\n</request>`,
    "",
    blocks,
    "",
    "Respond with JSON only, in this shape:",
    '{"scores":[{"id":"A","score":1-10,"reasoning":"one or two sentences"}],"winner":"A" or "tie","summary":"one or two sentences"}',
    "Include every answer id exactly once.",
  ].join("\n");
}

/**
 * Replaces the judge's own letters ("Answer B", "answer B") in its text with the
 * names the user sees, since those letters differ from the screen's labels.
 */
export function relabel(
  text: string,
  labels: Record<string, string>,
  displayName: (modelId: string) => string
): string {
  return text.replace(/\b([Aa]nswer)\s+([A-Z])\b/g, (match, _word, letter: string) => {
    const modelId = labels[letter];
    return modelId ? displayName(modelId) : match;
  });
}
