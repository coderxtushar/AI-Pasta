import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import { modelCard, saveAccountKey, saveBrowserKey, signIn } from "./helpers";

// The mock answers a follow-up with: Follow-up N: "<last message>" (<M> messages),
// where M counts the conversation it received, which proves each model got its history.

async function startConversation(page: Page, prompt: string) {
  for (const label of ["GPT-5.4 Mini", "Claude Sonnet 5.5", "Gemini Flash", "GPT-OSS 120B (Groq)"]) {
    await page.getByRole("checkbox", { name: label }).uncheck();
  }
  await page.locator("#prompt").fill(prompt);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(modelCard(page, "Qwen Plus").getByText("Hello from the mock!")).toBeVisible();
  await expect(modelCard(page, "DeepSeek Chat").getByText("Hi from the second mock!")).toBeVisible();
}

async function followUp(page: Page, text: string) {
  await page.locator("#follow-up").fill(text);
  await page.getByRole("button", { name: "Send follow-up" }).click();
}

test("follow-ups continue each model's own conversation", async ({ page }) => {
  await page.goto("/");
  await saveBrowserKey(page, "Qwen", "sk-e2e-qwen");
  await saveBrowserKey(page, "DeepSeek", "sk-e2e-deepseek");
  await startConversation(page, "hi");
  await expect(page.getByRole("region", { name: "AI judge" })).toBeVisible();

  await followUp(page, "tell me more");
  for (const name of ["Qwen Plus", "DeepSeek Chat"]) {
    const card = modelCard(page, name);
    await expect(card.getByText('Follow-up 1: "tell me more" (3 messages)')).toBeVisible();
    await expect(card.getByText("You: tell me more")).toBeVisible();
  }
  // Earlier answers stay in the thread.
  await expect(modelCard(page, "Qwen Plus").getByText("Hello from the mock!")).toBeVisible();
  // The judge scores the first prompt, so it's not offered after a follow-up.
  await expect(page.getByRole("region", { name: "AI judge" })).toHaveCount(0);

  await followUp(page, "and again");
  await expect(modelCard(page, "DeepSeek Chat").getByText('Follow-up 2: "and again" (5 messages)')).toBeVisible();
  await expect(page.getByText("turn 4 of 20")).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const lines = (await fs.readFile((await download.path())!, "utf8")).trimEnd().split("\r\n");
  expect(lines).toHaveLength(1 + 3 * 2);
  expect(lines.slice(1).map((l) => l.split(",").slice(0, 4).join(","))).toEqual([
    "hi,,0,deepseek-chat",
    "hi,,0,qwen-plus",
    "tell me more,,1,deepseek-chat",
    "tell me more,,1,qwen-plus",
    "and again,,2,deepseek-chat",
    "and again,,2,qwen-plus",
  ]);
});

test("after a failed turn, the next message still reaches the model", async ({ page }) => {
  await page.goto("/");
  await saveBrowserKey(page, "Qwen", "sk-e2e-qwen");
  await saveBrowserKey(page, "DeepSeek", "sk-e2e-deepseek");
  await startConversation(page, "hi");

  await followUp(page, "fail");
  await expect(modelCard(page, "Qwen Plus").getByText(/Qwen rejected the API key/)).toBeVisible();

  // The failed turn has no answer, so the two user messages are merged into one.
  await followUp(page, "after failure");
  await expect(modelCard(page, "Qwen Plus").getByText(/Follow-up 1: "fail\s+after failure" \(3 messages\)/)).toBeVisible();
});

test("signed-in conversations are saved turn by turn", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto("/");
  await saveAccountKey(page, "Qwen", "sk-e2e-qwen-account");
  await saveAccountKey(page, "DeepSeek", "sk-e2e-deepseek-account");
  await startConversation(page, "saved conversation");
  await followUp(page, "second turn");
  await expect(modelCard(page, "Qwen Plus").getByText('Follow-up 1: "second turn" (3 messages)')).toBeVisible();

  const path = (await page.getByRole("link", { name: "Open" }).getAttribute("href"))!;
  const id = path.split("/").pop();

  // A stale tab can't skip or repeat a turn.
  const stale = await page.request.post(`/api/comparisons/${id}/turns`, { data: { turn: 1, content: "again" } });
  expect(stale.status()).toBe(409);

  await page.goto(path);
  await expect(page.getByText("conversation of 2 turns")).toBeVisible();
  const card = modelCard(page, "DeepSeek Chat");
  await expect(card.getByText("Hi from the second mock!")).toBeVisible();
  await expect(card.getByText("You: second turn")).toBeVisible();
  await expect(card.getByText('Follow-up 1: "second turn" (3 messages)')).toBeVisible();

  const csv = await (await page.request.get(`/api/comparisons/${id}/csv`)).text();
  expect(csv).toContain('second turn,,1,deepseek-chat,DeepSeek Chat,done,"Follow-up 1: ""second turn"" (3 messages)"');

  await page.goto("/history?q=saved conversation");
  await expect(page.getByText("2 turns")).toBeVisible();
});
