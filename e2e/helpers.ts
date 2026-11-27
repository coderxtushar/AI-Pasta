import { expect, type BrowserContext, type Page, type APIRequestContext } from "@playwright/test";
import { E2E } from "./env";

export async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([
    { name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
}

/** Saves a key in the anonymous (browser) key panel. */
export async function saveBrowserKey(page: Page, provider: string, key: string) {
  await page.getByPlaceholder(`${provider} Key`).fill(key);
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

export const modelCard = (page: Page, label: string) => page.getByRole("region", { name: label });

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

/** Saves a key to the signed-in account, replacing one that's already there. */
export async function saveAccountKey(page: Page, provider: string, key: string) {
  const replace = page.getByRole("button", { name: `Replace ${provider} key` });
  if (await replace.isVisible()) await replace.click();
  await page.getByLabel(`${provider} key`).fill(key);
  await page.getByLabel(`${provider} key`).press("Enter");
  await expect(page.getByText(`${provider} key saved.`)).toBeVisible();
}
