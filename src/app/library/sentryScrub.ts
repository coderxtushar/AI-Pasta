import type { ErrorEvent } from "@sentry/nextjs";
import { safeErrorMessage } from "./redact";

const SENSITIVE_HEADERS = ["authorization", "cookie", "x-api-key", "api-key"];

/**
 * Sentry beforeSend hook. Request bodies hold prompts and API keys, and cookies
 * hold sessions, so none of them leave the server. Messages lose database
 * query parameters and anything key-shaped.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.includes(name.toLowerCase())) delete event.request.headers[name];
      }
    }
  }
  if (event.message) event.message = safeErrorMessage(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = safeErrorMessage(ex.value);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = safeErrorMessage(crumb.message);
    // Console breadcrumbs carry the raw logged arguments too.
    if (crumb.data?.arguments) delete crumb.data.arguments;
  }
  return event;
}
