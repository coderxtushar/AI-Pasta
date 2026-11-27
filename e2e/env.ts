// Shared settings for the end-to-end tests. Nothing here is a real secret.
export const E2E = {
  port: 3100,
  mockPort: 4545,
  databaseUrl: process.env.E2E_DATABASE_URL ?? "postgres://postgres:dev@localhost:55432/aipasta_e2e",
  ownerToken: "e2e-owner-session-token",
  otherToken: "e2e-other-session-token",
};

/** Env for the app under test: accounts on, Qwen and DeepSeek pointed at the mock provider. */
export const appEnv = {
  DATABASE_URL: E2E.databaseUrl,
  AUTH_SECRET: "e2e-auth-secret-not-for-production-0123456789",
  AUTH_TRUST_HOST: "true",
  AUTH_GOOGLE_ID: "e2e-google-client-id",
  AUTH_GOOGLE_SECRET: "e2e-google-client-secret",
  KEYS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  QWEN_BASE_URL: `http://localhost:${E2E.mockPort}`,
  DEEPSEEK_BASE_URL: `http://localhost:${E2E.mockPort}`,
  // Never talk to real Sentry or Upstash from tests.
  SENTRY_DSN: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
};
