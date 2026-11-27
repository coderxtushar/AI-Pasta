import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import { closeSheet, modelCard, saveAccountKey, saveBrowserKey, signIn } from "./helpers";

async function openSettings(page: Page) {
  await page.getByRole("button", { name: /Generation settings/ }).click();
}

/** Shared: system prompt, temperature 0.3, 256 max tokens. Qwen override: temperature 0.9. */
async function fillSettings(page: Page) {
  await openSettings(page);
  await page.getByLabel("System prompt").fill("Be brief.");
  await page.getByLabel("Temperature").fill("0.3");
  await page.getByLabel("Max output tokens").fill("256");
  await page.getByRole("tab", { name: "Qwen Plus" }).click();
  await page.getByLabel("Temperature").fill("0.9");
  await closeSheet(page);
}

test("settings reach the provider, with per-model overrides", async ({ page }) => {
  await page.goto("/app");
  await saveBrowserKey(page, "Qwen", "sk-e2e-browser-key");
  await fillSettings(page);
  await expect(page.getByRole("button", { name: /Generation settings/ })).toContainText(
    "system prompt · temperature 0.3 · max 256 tokens · 1 model override(s)"
  );

  await page.locator("#prompt").fill("echo-settings");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(modelCard(page, "Qwen Plus").getByText("system=Be brief. temperature=0.9 top_p=none max_tokens=256")).toBeVisible();
});

test("invalid settings block submitting", async ({ page }) => {
  await page.goto("/app");
  await saveBrowserKey(page, "Qwen", "sk-e2e-browser-key");
  await page.locator("#prompt").fill("hi");
  await openSettings(page);
  await page.getByLabel("Temperature").fill("3");
  await expect(page.getByRole("alert").filter({ hasText: "Temperature" })).toHaveText("Temperature must be between 0 and 2.");
  await closeSheet(page);
  // The toolbar button shows the problem too.
  await expect(page.getByRole("button", { name: /Generation settings/ })).toContainText("Temperature must be between 0 and 2.");
  await expect(page.getByRole("button", { name: "Compare", exact: true })).toBeDisabled();
  await openSettings(page);
  await page.getByLabel("Temperature").fill("1");
  await closeSheet(page);
  await expect(page.getByRole("button", { name: "Compare", exact: true })).toBeEnabled();
});

test("settings are remembered in this browser", async ({ page }) => {
  await page.goto("/app");
  await openSettings(page);
  await page.getByLabel("System prompt").fill("Remember me.");
  await page.reload();
  await openSettings(page);
  await expect(page.getByLabel("System prompt")).toHaveValue("Remember me.");
});

test("saved comparisons show their settings, and re-run restores them", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto("/app");
  await saveAccountKey(page, "Qwen", "sk-e2e-settings-key");

  await fillSettings(page);
  await page.locator("#prompt").fill("echo-settings");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(modelCard(page, "Qwen Plus").getByText(/temperature=0.9/)).toBeVisible();
  await page.getByRole("link", { name: "Open" }).click();

  const summary = page.getByLabel("Generation settings");
  await expect(summary).toContainText("Settings: system prompt · temperature 0.3 · max 256 tokens");
  await expect(summary).toContainText("Qwen Plus: temperature 0.9");
  await summary.getByText("System prompt (All models)").click();
  await expect(summary.getByText("Be brief.")).toBeVisible();

  await page.getByRole("link", { name: "Re-run" }).click();
  await openSettings(page);
  await expect(page.getByLabel("System prompt")).toHaveValue("Be brief.");
  await expect(page.getByLabel("Temperature")).toHaveValue("0.3");
  await page.getByRole("tab", { name: /Qwen Plus/ }).click();
  await expect(page.getByLabel("Temperature")).toHaveValue("0.9");
});
