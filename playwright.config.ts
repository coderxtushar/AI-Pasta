import { defineConfig, devices } from "@playwright/test";
import { E2E, appEnv } from "./e2e/env";

// Runs against a production build: `npm run build && npm run test:e2e`.
// Needs Postgres at E2E_DATABASE_URL (default: the local Docker one from the README).
// Set PW_CHANNEL=chrome to use an installed Chrome instead of Playwright's Chromium.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Tests share one seeded database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${E2E.port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
    },
  ],
  webServer: [
    {
      command: "node e2e/mock-provider.mjs",
      url: `http://localhost:${E2E.mockPort}/health`,
      env: { MOCK_PORT: String(E2E.mockPort) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next start -p ${E2E.port}`,
      url: `http://localhost:${E2E.port}`,
      env: appEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
