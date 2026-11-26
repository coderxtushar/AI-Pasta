import { expect, test } from "@playwright/test";
import { lastProviderAuth, modelCard, saveBrowserKey } from "./helpers";

test.describe("comparing without an account", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("streams an answer with metrics using a browser key", async ({ page, request }) => {
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    const submit = page.getByRole("button", { name: "Submit" });
    await expect(submit).toBeDisabled();

    await saveBrowserKey(page, "Qwen", "sk-e2e-browser-key");
    await page.locator("#prompt").fill("hi");
    await submit.click();

    const qwen = modelCard(page, "Qwen Plus");
    await expect(qwen.getByText("Hello from the mock!")).toBeVisible();
    await expect(qwen.getByText("Done")).toBeVisible();
    await expect(qwen.getByText(/first token .* · 12 in \/ 5 out tokens · cost —/)).toBeVisible();
    await expect(modelCard(page, "GPT-5.4 Mini").getByText("No OpenAI API key saved.")).toBeVisible();
    expect(await lastProviderAuth(request)).toBe("Bearer sk-e2e-browser-key");
  });

  test("Stop keeps the partial answer", async ({ page }) => {
    await saveBrowserKey(page, "Qwen", "sk-e2e-browser-key");
    await page.locator("#prompt").fill("slow");
    await page.getByRole("button", { name: "Submit" }).click();

    const qwen = modelCard(page, "Qwen Plus");
    await expect(qwen.getByText(/tick tick/)).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(qwen.getByText("Stopped")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);

    const partial = await qwen.locator("pre").innerText();
    await page.waitForTimeout(800);
    expect(await qwen.locator("pre").innerText()).toBe(partial);
  });

  test("explains a rejected key", async ({ page }) => {
    await saveBrowserKey(page, "Qwen", "sk-e2e-wrong-key");
    await page.locator("#prompt").fill("fail");
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(modelCard(page, "Qwen Plus").getByText(/Qwen rejected the API key/)).toBeVisible();
  });

  test("signed-out users can't open history", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByText("Sign in to see the comparisons you've run.")).toBeVisible();
  });
});
