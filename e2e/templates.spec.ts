import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import { signIn } from "./helpers";

async function saveTemplate(page: Page, name: string, prompt: string) {
  await page.locator("#prompt").fill(prompt);
  await page.getByRole("button", { name: "Save as template" }).click();
  await page.getByLabel("Template name").fill(name);
  await page.getByRole("group", { name: "Save template" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Saved template “${name}”.`)).toBeVisible();
}

test("browser templates: save, reload, load, replace by name, delete", async ({ page }) => {
  await page.goto("/");
  await saveTemplate(page, "Greeting", "Say hello to {{input}}");
  await page.reload();

  const picker = page.getByLabel("Templates");
  await picker.selectOption({ label: "Greeting" });
  await expect(page.locator("#prompt")).toHaveValue("Say hello to {{input}}");

  await saveTemplate(page, "Greeting", "Say goodbye to {{input}}");
  await expect(picker.locator("option", { hasText: "Greeting" })).toHaveCount(1);
  await picker.selectOption({ label: "Load a template…" });
  await page.locator("#prompt").fill("");
  await picker.selectOption({ label: "Greeting" });
  await expect(page.locator("#prompt")).toHaveValue("Say goodbye to {{input}}");

  await page.getByRole("button", { name: "Delete template" }).click();
  await expect(page.getByText("Deleted template “Greeting”.")).toBeVisible();
  await expect(picker.locator("option", { hasText: "Greeting" })).toHaveCount(0);
});

test("account templates follow the user, and only that user", async ({ browser }) => {
  const owner = await browser.newContext();
  await signIn(owner, E2E.ownerToken);
  const page = await owner.newPage();
  await page.goto("/");
  await saveTemplate(page, "Owner template", "Summarize {{input}} in one line.");

  const otherDevice = await browser.newContext();
  await signIn(otherDevice, E2E.ownerToken);
  const page2 = await otherDevice.newPage();
  await page2.goto("/");
  await page2.getByLabel("Templates").selectOption({ label: "Owner template" });
  await expect(page2.locator("#prompt")).toHaveValue("Summarize {{input}} in one line.");

  const otherUser = await browser.newContext();
  await signIn(otherUser, E2E.otherToken);
  const page3 = await otherUser.newPage();
  await page3.goto("/");
  await expect(page3.getByLabel("Templates").locator("option", { hasText: "Owner template" })).toHaveCount(0);

  await Promise.all([owner.close(), otherDevice.close(), otherUser.close()]);
});
