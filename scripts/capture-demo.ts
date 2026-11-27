/**
 * Records a real comparison for the landing page replay, replacing the
 * illustrative example in src/app/library/demo-run.json.
 *
 *   OPENAI_API_KEY=… ANTHROPIC_API_KEY=… npm run demo:capture -- "optional prompt"
 *
 * Keys (from the environment or .env/.env.local): OPENAI_API_KEY, ANTHROPIC_API_KEY,
 * GEMINI_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY, DASHSCOPE_API_KEY. Models without
 * a key are skipped. Keys are only used for these calls and never written anywhere.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const OUT = "src/app/library/demo-run.json";
const KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
};

async function main() {
  const { streamText } = await import("ai");
  const { MODELS, estimateCostUsd } = await import("../src/app/library/models");
  const { getLanguageModel } = await import("../src/server/llm");

  const current = JSON.parse(readFileSync(OUT, "utf8"));
  const prompt = process.argv.slice(2).join(" ").trim() || current.prompt;

  const answers = [];
  for (const model of MODELS) {
    const apiKey = process.env[KEY_ENV[model.provider]];
    if (!apiKey) {
      console.log(`skip  ${model.label} (no ${KEY_ENV[model.provider]})`);
      continue;
    }
    const start = performance.now();
    let ttftMs: number | null = null;
    let text = "";
    try {
      const result = streamText({ model: getLanguageModel(model, apiKey), prompt, maxOutputTokens: 1024, maxRetries: 1 });
      for await (const delta of result.textStream) {
        if (ttftMs === null) ttftMs = Math.round(performance.now() - start);
        text += delta;
      }
      const usage = await result.totalUsage;
      const totalMs = Math.round(performance.now() - start);
      const costUsd = estimateCostUsd(model, usage.inputTokens, usage.outputTokens);
      answers.push({
        modelId: model.id,
        text,
        ttftMs: ttftMs ?? totalMs,
        totalMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        ...(costUsd !== undefined ? { costUsd } : {}),
      });
      console.log(`ok    ${model.label}: ${totalMs} ms, ${usage.outputTokens ?? "?"} tokens`);
    } catch (e) {
      console.log(`fail  ${model.label}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }

  if (answers.length < 2) {
    console.error("Need at least two successful answers; demo-run.json was not changed.");
    process.exit(1);
  }
  writeFileSync(
    OUT,
    JSON.stringify({ source: "recorded", recordedAt: new Date().toISOString(), prompt, answers }, null, 2) + "\n"
  );
  console.log(`Wrote ${answers.length} answers to ${OUT}. The landing page now labels it a recorded run.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
