import { expect, type BrowserContext, type Page, type APIRequestContext } from "@playwright/test";
import { E2E } from "./env";

export async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([
    { name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
}

/** Opens the API keys sheet on the compare page (no-op if it's already open). */
export async function openKeys(page: Page) {
  const sheet = page.getByRole("dialog", { name: "API keys" });
  if (await sheet.isVisible()) return sheet;
  await page.getByRole("button", { name: /API keys/ }).first().click();
  await expect(sheet).toBeVisible();
  return sheet;
}

export async function closeSheet(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Saves a key in the anonymous (browser) key panel. */
export async function saveBrowserKey(page: Page, provider: string, key: string) {
  const sheet = await openKeys(page);
  await sheet.getByPlaceholder(`${provider} Key`).fill(key);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await closeSheet(page);
}

/** Saves a key to the signed-in account, replacing one that's already there. */
export async function saveAccountKey(page: Page, provider: string, key: string) {
  const sheet = await openKeys(page);
  const replace = sheet.getByRole("button", { name: `Replace ${provider} key` });
  if (await replace.isVisible()) await replace.click();
  await sheet.getByLabel(`${provider} key`).fill(key);
  await sheet.getByLabel(`${provider} key`).press("Enter");
  await expect(sheet.getByText(`${provider} key saved.`)).toBeVisible();
  await closeSheet(page);
}

export const modelCard = (page: Page, label: string) => page.getByRole("region", { name: label });

/** The rendered answer text inside a model card. */
export const answerOf = (page: Page, label: string) => modelCard(page, label).locator(".answer-prose").last();

export const compareButton = (page: Page) => page.getByRole("button", { name: "Compare", exact: true });

export async function lastProviderAuth(request: APIRequestContext): Promise<string | null> {
  const res = await request.get(`http://localhost:${E2E.mockPort}/last-auth`);
  return (await res.json()).lastAuth;
}

/** Records every response body so tests can assert a secret never comes back. */
export function watchResponses(page: Page) {
  const bodies: string[] = [];
  page.on("response", async (res) => {
    try {
      bodies.push(await res.text());
    } catch {
      // Redirects and aborted streams have no body.
    }
  });
  return {
    expectNoneContain: (secret: string) =>
      expect(bodies.filter((b) => b.includes(secret)), `"${secret}" appeared in a response`).toHaveLength(0),
  };
}
