import fs from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { E2E } from "./env";
import { modelCard, saveAccountKey, saveBrowserKey, signIn } from "./helpers";

async function readCsv(download: Download) {
  const text = (await fs.readFile((await download.path())!, "utf8")).replace(/^﻿/, "");
  return text.trimEnd().split("\r\n");
}

/** Leaves only Qwen and DeepSeek (both served by the mock) checked on the batch page. */
async function onlyMockModels(page: Page) {
  for (const label of ["GPT-5.4 Mini", "Claude Sonnet 5.5", "Gemini Flash", "GPT-OSS 120B (Groq)"]) {
    await page.getByRole("checkbox", { name: label }).uncheck();
  }
}

test("batch fills the template for each input and exports CSV", async ({ page }) => {
  await page.goto("/");
  await saveBrowserKey(page, "Qwen", "sk-e2e-qwen");
  await saveBrowserKey(page, "DeepSeek", "sk-e2e-deepseek");

  await page.getByRole("link", { name: "Batch" }).click();
  // Models without keys start unchecked.
  await expect(page.getByRole("checkbox", { name: /GPT-5.4 Mini/ })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Qwen Plus/ })).toBeChecked();

  await page.locator("#batch-template").fill("echo: review {{input}}");
  await page.locator("#batch-inputs").fill("apple\n=1+1");
  await expect(page.getByText("2 input(s) × 2 model(s) = 4 answers")).toBeVisible();
  await page.getByRole("button", { name: "Run batch" }).click();

  await expect(page.getByRole("status").filter({ hasText: "done" })).toHaveText("4 / 4 done");
  const table = page.getByRole("table", { name: "Batch results" });
  await expect(table.getByText("You said: echo: review apple")).toHaveCount(2);
  await expect(table.getByText("You said: echo: review =1+1")).toHaveCount(2);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ai-pasta-batch-.*\.csv$/);
  const lines = await readCsv(download);
  expect(lines[0]).toBe(
    "prompt,input,model,model_label,status,answer,error,ttft_ms,total_ms,input_tokens,output_tokens,reasoning_tokens,cost_usd,notes,settings,judge_scores,blind_pick"
  );
  expect(lines).toHaveLength(5);
  expect(lines[1]).toMatch(/^echo: review apple,apple,deepseek-chat,DeepSeek Chat,done,You said: echo: review apple,/);
  // A cell that looks like a formula is neutralized so spreadsheets don't run it.
  expect(lines[3]).toMatch(/^echo: review =1\+1,'=1\+1,deepseek-chat,/);
});

test("Stop ends a batch and marks unfinished answers", async ({ page }) => {
  await page.goto("/");
  await saveBrowserKey(page, "Qwen", "sk-e2e-qwen");
  await page.goto("/batch");
  await onlyMockModels(page);
  await page.getByRole("checkbox", { name: /DeepSeek Chat/ }).uncheck();
  await page.locator("#batch-inputs").fill("slow\nslow\nslow");
  await page.getByRole("button", { name: "Run batch" }).click();
  await expect(page.getByRole("table", { name: "Batch results" }).getByText(/tick tick/)).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Run batch" })).toBeEnabled();
  await expect(page.getByRole("table", { name: "Batch results" }).getByText("Stopped")).toHaveCount(3);
});

test("signed-in batches save each prompt to history", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto("/");
  await saveAccountKey(page, "Qwen", "sk-e2e-qwen-account");
  await page.goto("/batch");
  await onlyMockModels(page);
  await page.getByRole("checkbox", { name: /DeepSeek Chat/ }).uncheck();
  await page.locator("#batch-template").fill("echo: history {{input}}");
  await page.locator("#batch-inputs").fill("one\ntwo");
  await page.getByRole("button", { name: "Run batch" }).click();
  await expect(page.getByRole("status").filter({ hasText: "done" })).toHaveText("2 / 2 done");
  await expect(page.getByRole("link", { name: "Saved" })).toHaveCount(2);

  await page.goto("/history?q=echo: history");
  await expect(page.getByText("echo: history one")).toBeVisible();
  await expect(page.getByText("echo: history two")).toBeVisible();
});

test("comparisons export CSV live and from their saved page", async ({ page, context, browser }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto("/");
  await saveAccountKey(page, "Qwen", "sk-e2e-qwen-account");
  for (const label of ["GPT-5.4 Mini", "Claude Sonnet 5.5", "Gemini Flash", "DeepSeek Chat", "GPT-OSS 120B (Groq)"]) {
    await page.getByRole("checkbox", { name: label }).uncheck();
  }
  await page.locator("#prompt").fill("echo: csv please");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(modelCard(page, "Qwen Plus").getByText("You said: echo: csv please")).toBeVisible();

  const [live] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  expect((await readCsv(live))[1]).toMatch(/^echo: csv please,,qwen-plus,Qwen Plus,done,You said: echo: csv please,/);

  await page.getByRole("link", { name: "Open" }).click();
  const csvPath = (await page.getByRole("link", { name: "Export CSV" }).getAttribute("href"))!;
  const res = await page.request.get(csvPath);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="ai-pasta-[0-9a-f]{8}\.csv"/);
  expect(await res.text()).toContain("qwen-plus,Qwen Plus,done,You said: echo: csv please");

  // Private comparisons can't be downloaded by anyone else.
  const anon = await browser.newContext();
  expect((await anon.request.get(`http://localhost:${E2E.port}${csvPath}`)).status()).toBe(404);
  await anon.close();
});
