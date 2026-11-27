import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import { modelCard, saveAccountKey, saveBrowserKey, signIn } from "./helpers";

// The mock judge always prefers DeepSeek's "Hi from the second mock!" (9/10 vs 5/10)
// and writes its reasoning using its own letters ("Answer B …").

async function runQwenAndDeepSeek(page: Page, prompt: string, { blind = false } = {}) {
  for (const label of ["GPT-5.4 Mini", "Claude Sonnet 5.5", "Gemini Flash", "GPT-OSS 120B (Groq)"]) {
    await page.getByRole("checkbox", { name: label }).uncheck();
  }
  if (blind) await page.getByRole("checkbox", { name: /Blind mode/ }).check();
  await page.locator("#prompt").fill(prompt);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByText("Hello from the mock!")).toBeVisible();
  await expect(page.getByText("Hi from the second mock!")).toBeVisible();
}

const judgePanel = (page: Page) => page.getByRole("region", { name: "AI judge" });

test("a judge scores the answers and explains its pick", async ({ page }) => {
  await page.goto("/app");
  await saveBrowserKey(page, "Qwen", "sk-e2e-qwen");
  await saveBrowserKey(page, "DeepSeek", "sk-e2e-deepseek");
  await runQwenAndDeepSeek(page, "judge me");

  const panel = judgePanel(page);
  await panel.getByLabel("Judge model").selectOption({ label: "Qwen Plus" });
  await expect(panel.getByText("This judge also wrote one of the answers")).toBeVisible();
  await panel.getByRole("button", { name: "Judge answers" }).click();

  // The judge's letters are translated back into the names on screen.
  await expect(panel.getByRole("status")).toContainText("Qwen Plus picks DeepSeek Chat. DeepSeek Chat is friendlier.");
  await expect(modelCard(page, "DeepSeek Chat").getByText("9/10 · DeepSeek Chat is warm and clear.")).toBeVisible();
  await expect(modelCard(page, "Qwen Plus").getByText("5/10 · Qwen Plus is fine but plain.")).toBeVisible();
});

test("in blind mode the verdict uses the anonymous labels until the vote", async ({ page }) => {
  await page.goto("/app");
  await saveBrowserKey(page, "Qwen", "sk-e2e-qwen");
  await saveBrowserKey(page, "DeepSeek", "sk-e2e-deepseek");
  await runQwenAndDeepSeek(page, "blind judge", { blind: true });

  await judgePanel(page).getByRole("button", { name: "Judge answers" }).click();
  const status = judgePanel(page).getByRole("status");
  // The judge's own name is shown (you chose it); the answers stay anonymous.
  await expect(status).toContainText(/picks Model [AB]\. Model [AB] is friendlier\./);
  await expect(status).not.toContainText(/picks (DeepSeek|Qwen)|(DeepSeek Chat|Qwen Plus) is friendlier/);

  await page.getByRole("button", { name: "It's a tie" }).click();
  await expect(status).toContainText("picks DeepSeek Chat. DeepSeek Chat is friendlier.");
});

test("signed-in verdicts are saved with the comparison", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto("/app");
  await saveAccountKey(page, "Qwen", "sk-e2e-qwen-account");
  await saveAccountKey(page, "DeepSeek", "sk-e2e-deepseek-account");
  await runQwenAndDeepSeek(page, "saved judge");

  await judgePanel(page).getByRole("button", { name: "Judge answers" }).click();
  await expect(judgePanel(page).getByRole("status")).toContainText("picks DeepSeek Chat");

  await page.getByRole("link", { name: "Open" }).click();
  const judges = page.getByRole("region", { name: "AI judges" });
  await expect(judges).toContainText("DeepSeek Chat picks DeepSeek Chat. DeepSeek Chat is friendlier.");
  await expect(modelCard(page, "DeepSeek Chat").getByText("Judge (DeepSeek Chat):")).toBeVisible();
  await expect(modelCard(page, "Qwen Plus").getByText(/5\/10 · Qwen Plus is fine but plain\./)).toBeVisible();
});
