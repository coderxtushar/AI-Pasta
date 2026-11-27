import { expect, test } from "@playwright/test";
import { E2E } from "./env";
import { lastProviderAuth, modelCard, saveBrowserKey, signIn, watchResponses } from "./helpers";

// One user journey, in order: the tests share the saved comparison.
test.describe.configure({ mode: "serial" });

const KEY = "sk-e2e-account-key-WXYZ";
let comparisonPath = "";

test("moves browser keys into the account", async ({ page, context }) => {
  const responses = watchResponses(page);
  await page.goto("/");
  await saveBrowserKey(page, "Qwen", KEY);

  await signIn(context, E2E.ownerToken);
  await page.reload();
  await expect(page.getByText("Owner Person")).toBeVisible();
  await expect(page.getByText("This browser has API keys saved locally")).toBeVisible();

  await page.getByRole("button", { name: "Move to account" }).click();
  await expect(page.getByText("This browser has API keys saved locally")).toBeHidden();
  await expect(page.getByText("••••WXYZ")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("apiKeys"))).toBeNull();
  responses.expectNoneContain(KEY);
});

test("runs with the account key and saves to history", async ({ page, context, request }) => {
  await signIn(context, E2E.ownerToken);
  const responses = watchResponses(page);
  await page.goto("/");
  await page.locator("#prompt").fill("e2e history prompt");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(modelCard(page, "Qwen Plus").getByText("Hello from the mock!")).toBeVisible();
  await expect(modelCard(page, "GPT-5.4 Mini").getByText("No OpenAI key saved to your account.")).toBeVisible();
  expect(await lastProviderAuth(request)).toBe(`Bearer ${KEY}`);
  responses.expectNoneContain(KEY);

  await expect(page.getByText("Saved to your history")).toBeVisible();
  comparisonPath = (await page.getByRole("link", { name: "Open" }).getAttribute("href"))!;
  expect(comparisonPath).toMatch(/^\/c\/[0-9a-f-]{36}$/);

  await page.goto("/history?q=HISTORY");
  await expect(page.getByText("e2e history prompt")).toBeVisible();
  await page.goto("/history?q=nothing-matches");
  await expect(page.getByText("No comparisons match")).toBeVisible();
});

test("private comparisons are only visible to their owner", async ({ page, context, browser }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto(comparisonPath);
  // Wait for the saved row: the server writes it as the stream ends.
  await expect(modelCard(page, "Qwen Plus").getByText("Hello from the mock!")).toBeVisible();
  await expect(page.getByText("Only you can see this comparison.")).toBeVisible();

  const other = await browser.newContext();
  await signIn(other, E2E.otherToken);
  expect((await (await other.newPage()).goto(comparisonPath))?.status()).toBe(404);
  const anon = await browser.newContext();
  expect((await (await anon.newPage()).goto(comparisonPath))?.status()).toBe(404);
  await Promise.all([other.close(), anon.close()]);
});

test("sharing makes it public without owner controls", async ({ page, context, browser }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto(comparisonPath);
  await page.getByRole("button", { name: "Share publicly" }).click();
  await expect(page.getByText("Anyone with the link can view this comparison.")).toBeVisible();

  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  expect((await anonPage.goto(comparisonPath))?.status()).toBe(200);
  await expect(anonPage.getByRole("heading", { name: "Shared comparison" })).toBeVisible();
  await expect(anonPage.getByText("Hello from the mock!")).toBeVisible();
  await expect(anonPage.getByRole("button", { name: /Delete|Make private|Share publicly/ })).toHaveCount(0);
  await expect(anonPage.getByText("Owner Person")).toHaveCount(0);
  await expect(anonPage.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");

  await anonPage.getByRole("link", { name: "Try this prompt" }).click();
  await expect(anonPage.locator("#prompt")).toHaveValue("e2e history prompt");
  await anon.close();

  await page.getByRole("button", { name: "Make private" }).click();
  await expect(page.getByText("Only you can see this comparison.")).toBeVisible();
});

test("re-run pre-fills the prompt and models", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto(comparisonPath);
  await page.getByRole("link", { name: "Re-run" }).click();
  await expect(page.locator("#prompt")).toHaveValue("e2e history prompt");
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(1);
});

test("delete removes the comparison", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto(comparisonPath);
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("e2e history prompt")).toHaveCount(0);
  expect((await page.goto(comparisonPath))?.status()).toBe(404);
});

test("replacing and removing the saved key", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  const responses = watchResponses(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Replace Qwen key" }).click();
  await page.getByLabel("Qwen key").fill("sk-e2e-replaced-9876");
  await page.getByLabel("Qwen key").press("Enter");
  await expect(page.getByText("••••9876")).toBeVisible();

  await page.getByRole("button", { name: "Remove Qwen key" }).click();
  await expect(page.getByText("Qwen key removed.")).toBeVisible();
  await page.locator("#prompt").fill("hi");
  await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled();
  responses.expectNoneContain("sk-e2e-replaced-9876");
});
