import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./env";
import { modelCard, saveAccountKey, saveBrowserKey, signIn } from "./helpers";

// Votes build on each other (leaderboard counts), so run in order.
test.describe.configure({ mode: "serial" });

const ANSWERS = ["Hello from the mock!", "Hi from the second mock!"];
const NAMES = ["Qwen Plus", "DeepSeek Chat"];

/** Leaves only Qwen and DeepSeek (both served by the mock) selected and turns on blind mode. */
async function startBlindRun(page: Page, prompt: string) {
  for (const label of ["GPT-5.4 Mini", "Claude Sonnet 5.5", "Gemini Flash", "GPT-OSS 120B (Groq)"]) {
    await page.getByRole("checkbox", { name: label }).uncheck();
  }
  await page.getByRole("checkbox", { name: /Blind mode/ }).check();
  await page.locator("#prompt").fill(prompt);
  await page.getByRole("button", { name: "Submit" }).click();
  for (const answer of ANSWERS) await expect(page.getByText(answer)).toBeVisible();
}

test("anonymous blind run hides names until the vote", async ({ page }) => {
  await page.goto("/");
  await saveBrowserKey(page, "Qwen", "sk-e2e-qwen");
  await saveBrowserKey(page, "DeepSeek", "sk-e2e-deepseek");
  await startBlindRun(page, "blind anonymous");

  await expect(modelCard(page, "Model A")).toBeVisible();
  await expect(modelCard(page, "Model B")).toBeVisible();
  for (const name of NAMES) await expect(page.getByRole("heading", { name })).toHaveCount(0);
  // Latency, tokens and cost could identify a model, so they're hidden too.
  await expect(page.getByText(/first token/)).toHaveCount(0);

  await page.getByRole("button", { name: "It's a tie" }).click();
  await expect(page.getByText("You called it a tie.")).toBeVisible();
  for (const name of NAMES) await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(/was Model [AB]/)).toHaveCount(2);
  await expect(page.getByText(/first token/)).toHaveCount(2);
});

let savedPath = "";
let winner = "";

test("signed-in vote is saved, revealed and counted", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto("/");
  await saveAccountKey(page, "Qwen", "sk-e2e-qwen-account");
  await saveAccountKey(page, "DeepSeek", "sk-e2e-deepseek-account");
  await startBlindRun(page, "blind signed in");

  // No link to the saved page before voting: it shows model names.
  await expect(page.getByRole("link", { name: "Open" })).toHaveCount(0);

  const answerA = await modelCard(page, "Model A").locator("pre").innerText();
  winner = NAMES[ANSWERS.indexOf(answerA)];
  await page.getByRole("button", { name: "Pick Model A" }).click();

  await expect(page.getByText(`You picked ${winner}. Saved to your leaderboard.`)).toBeVisible();
  await expect(modelCard(page, winner).getByText("Your pick")).toBeVisible();
  await expect(modelCard(page, winner).getByText("was Model A")).toBeVisible();

  savedPath = (await page.getByRole("link", { name: "Open" }).getAttribute("href"))!;
  await page.goto(savedPath);
  await expect(page.getByText(`you picked ${winner} without seeing names.`)).toBeVisible();
  await expect(modelCard(page, winner).getByText("Blind pick")).toBeVisible();
});

test("each blind comparison takes one vote", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  const id = savedPath.split("/").pop();
  const res = await page.request.post(`/api/comparisons/${id}/vote`, { data: { winner: null } });
  expect(res.status()).toBe(409);
});

test("the leaderboard reflects wins and ties", async ({ page, context }) => {
  await signIn(context, E2E.ownerToken);
  await page.goto("/");
  await startBlindRun(page, "blind tie");
  await page.getByRole("button", { name: "It's a tie" }).click();
  await expect(page.getByText("You called it a tie. Saved to your leaderboard.")).toBeVisible();

  await page.getByRole("link", { name: "Leaderboard" }).click();
  const loser = NAMES.find((n) => n !== winner)!;
  const row = (name: string) => page.getByRole("row", { name: new RegExp(name) });
  // Columns: #, model, win rate, wins, ties, votes.
  await expect(row(winner)).toHaveText(new RegExp(`1${winner}50%112`));
  await expect(row(loser)).toHaveText(new RegExp(`2${loser}0%012`));
});
