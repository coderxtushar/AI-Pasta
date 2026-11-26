import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent } from "./sentryScrub";

describe("scrubEvent", () => {
  it("drops bodies, cookies and auth headers, and redacts keys", () => {
    const event = {
      type: undefined,
      message: "failed with sk-live-abcdef",
      request: {
        data: '{"prompt":"secret plans","apiKey":"sk-123456"}',
        cookies: { "authjs.session-token": "tok" },
        headers: { Authorization: "Bearer sk-1", Cookie: "a=b", "content-type": "application/json" },
      },
      exception: { values: [{ type: "Error", value: "Incorrect API key provided: sk-proj-xyz" }] },
      breadcrumbs: [{ message: "using gsk_groqkey", data: { arguments: ["Session lookup failed", "params: tok"] } }],
    } as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toEqual({ "content-type": "application/json" });
    expect(out.message).toBe("failed with [redacted]");
    expect(out.exception?.values?.[0].value).toBe("Incorrect API key provided: [redacted]");
    expect(out.breadcrumbs?.[0].message).toBe("using [redacted]");
    expect(out.breadcrumbs?.[0].data?.arguments).toBeUndefined();
  });

  it("drops database query parameters from error messages", () => {
    const event = {
      type: undefined,
      exception: { values: [{ value: "Failed query: select * from session where token = $1\nparams: SESSIONTOKEN" }] },
    } as ErrorEvent;
    expect(scrubEvent(event).exception?.values?.[0].value).toBe(
      "Failed query: select * from session where token = $1\nparams: [redacted]"
    );
  });
});
