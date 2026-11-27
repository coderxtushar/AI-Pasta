import { expect, test } from "@playwright/test";
import { closeSheet, compareButton, modelCard, openKeys, saveBrowserKey } from "./helpers";

test.describe("landing page", () => {
  test("explains the product and starts a comparison without signing up", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Same prompt. Every model. Real numbers.");
    await expect(page.getByText("No signup. One API key is enough.")).toBeVisible();

    // The replay is labelled honestly and plays to the end.
    await expect(page.getByText(/Illustrative example · written by hand, not measured/)).toBeVisible();
    const answers = page.getByLabel("Answers");
    await expect(answers.getByText("Done")).toHaveCount(6, { timeout: 15_000 });
    await expect(answers.getByText("Fastest")).toHaveCount(1);

    await page.getByRole("main").getByRole("link", { name: "Start comparing" }).first().click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("#prompt")).toBeVisible();
  });

  test("pressing Enter on the landing page opens the workspace (the ↵ hint is real)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("Try this prompt opens the workspace with the demo prompt", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Try this prompt" }).click();
    await expect(page).toHaveURL(/\/app\?prompt=/);
    await expect(page.locator("#prompt")).toHaveValue(/each customer's three most recent orders/);
  });

  test("old re-run links still reach the workspace", async ({ page }) => {
    const res = await page.goto("/?from=00000000-0000-0000-0000-000000000000");
    expect(res?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/app\?from=/);
  });

  test("with reduced motion the replay shows the finished run at once", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByLabel("Answers").getByText("Done")).toHaveCount(6, { timeout: 3_000 });
    await context.close();
  });
});

test.describe("workspace extras", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app");
  });

  test("the command menu runs actions", async ({ page }) => {
    await page.locator("body").press("ControlOrMeta+k");
    const menu = page.getByRole("dialog", { name: "Command menu" });
    await expect(menu).toBeVisible();
    await menu.getByPlaceholder("Type a command or search…").fill("blind");
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("checkbox", { name: /Blind mode/ })).toBeChecked();

    await page.locator("body").press("ControlOrMeta+k");
    await page.getByPlaceholder("Type a command or search…").fill("API keys");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "API keys" })).toBeVisible();
  });

  test("retry re-runs one model with the run's own prompt", async ({ page }) => {
    await saveBrowserKey(page, "Qwen", "sk-e2e-qwen");
    await saveBrowserKey(page, "DeepSeek", "sk-e2e-deepseek");
    for (const label of ["GPT-5.4 Mini", "Claude Sonnet 5.5", "Gemini Flash", "GPT-OSS 120B (Groq)"]) {
      await page.getByRole("checkbox", { name: label }).uncheck();
    }
    await page.locator("#prompt").fill("fail");
    await compareButton(page).click();
    const qwen = modelCard(page, "Qwen Plus");
    await expect(qwen.getByText(/Qwen rejected the API key/)).toBeVisible();

    await page.locator("#prompt").fill("something else");
    // Retry re-sends the run's own prompt ("fail"), not whatever is in the box now.
    await qwen.getByRole("button", { name: "Retry" }).click();
    await expect(qwen.getByText(/Qwen rejected the API key/)).toBeVisible();
  });

  test("two answers can be diffed word by word, and the faster one is marked", async ({ page }) => {
    await saveBrowserKey(page, "Qwen", "sk-e2e-qwen");
    await saveBrowserKey(page, "DeepSeek", "sk-e2e-deepseek");
    for (const label of ["GPT-5.4 Mini", "Claude Sonnet 5.5", "Gemini Flash", "GPT-OSS 120B (Groq)"]) {
      await page.getByRole("checkbox", { name: label }).uncheck();
    }
    await page.locator("#prompt").fill("hi");
    await compareButton(page).click();
    await expect(modelCard(page, "Qwen Plus").getByText("Done")).toBeVisible();
    await expect(modelCard(page, "DeepSeek Chat").getByText("Done")).toBeVisible();
    await expect(page.getByText("Fastest")).toHaveCount(1);

    await page.getByRole("button", { name: "Compare answers" }).click();
    const dialog = page.getByRole("dialog", { name: "Compare two answers" });
    await expect(dialog.getByText(/\d+ words differ/)).toBeVisible();
    await expect(dialog.locator("del, ins")).not.toHaveCount(0);
  });

  test("the theme can be switched to light and back", async ({ page }) => {
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("the keys sheet explains where keys live", async ({ page }) => {
    const sheet = await openKeys(page);
    await expect(sheet.getByText(/You pay each provider directly; AI Pasta adds nothing\./)).toBeVisible();
    await closeSheet(page);
  });
});
