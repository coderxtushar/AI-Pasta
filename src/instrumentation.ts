import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/app/library/sentryScrub";

// Error tracking is optional: without SENTRY_DSN, Sentry stays disabled.
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Never attach IPs, cookies or request bodies (prompts and API keys).
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    beforeSend: scrubEvent,
  });
}

// Reports errors thrown in route handlers, server components and actions.
export const onRequestError = Sentry.captureRequestError;
