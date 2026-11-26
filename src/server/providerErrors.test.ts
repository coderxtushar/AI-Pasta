import { describe, expect, it } from "vitest";
import { APICallError, RetryError } from "ai";
import { describeProviderError, redactSecrets } from "./providerErrors";

function apiError(statusCode: number, message: string) {
  return new APICallError({
    message,
    url: "https://api.example.com",
    requestBodyValues: {},
    statusCode,
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
}

describe("describeProviderError", () => {
  it("explains a rejected key without echoing provider text", () => {
    const msg = describeProviderError(
      apiError(401, "Incorrect API key provided: sk-proj-abc123****wxyz."),
      "openai",
      "gpt-5.4-mini",
      "sk-proj-abc123secretwxyz"
    );
    expect(msg).toBe("OpenAI rejected the API key. Check that it's correct, active, and has access to this model.");
  });

  it("treats Gemini's 400 invalid-key error as a key problem", () => {
    const msg = describeProviderError(apiError(400, "API key not valid. Please pass a valid API key."), "google", "g");
    expect(msg).toContain("Gemini rejected the API key");
  });

  it("names the model on 404", () => {
    expect(describeProviderError(apiError(404, "not found"), "anthropic", "claude-x")).toBe(
      'Anthropic doesn\'t recognize the model "claude-x". It may have been renamed or retired.'
    );
  });

  it("explains rate limits and keeps a redacted detail", () => {
    const msg = describeProviderError(apiError(429, "Quota exceeded for key sk-live-999"), "deepseek", "d");
    expect(msg).toContain("DeepSeek rate limit or quota reached");
    expect(msg).toContain("[redacted]");
    expect(msg).not.toContain("sk-live-999");
  });

  it("reports provider outages", () => {
    expect(describeProviderError(apiError(503, "overloaded"), "groq", "m")).toContain("Groq is having problems right now (HTTP 503)");
  });

  it("unwraps the last error after retries", () => {
    const retry = new RetryError({ message: "failed after 3 attempts", reason: "maxRetriesExceeded", errors: [apiError(503, "x")] });
    expect(describeProviderError(retry, "qwen", "m")).toContain("Qwen is having problems");
  });

  it("redacts the request's key from unexpected errors", () => {
    expect(describeProviderError(new Error("bad header: weird-key-1234"), "openai", "m", "weird-key-1234")).toBe(
      "bad header: [redacted]"
    );
  });
});

describe("redactSecrets", () => {
  it("removes common key shapes", () => {
    expect(redactSecrets("a sk-abc b gsk_def c AIzaXYZ d")).toBe("a [redacted] b [redacted] c [redacted] d");
  });
});
