import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./crypto";

const newKey = () => randomBytes(32).toString("base64");

describe("crypto", () => {
  beforeEach(() => {
    vi.stubEnv("KEYS_ENCRYPTION_KEY", newKey());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a secret", () => {
    const sealed = encryptSecret("sk-secret-123", "ctx");
    expect(sealed.ciphertext).not.toContain("sk-secret");
    expect(decryptSecret(sealed, "ctx")).toBe("sk-secret-123");
  });

  it("uses a fresh IV each time", () => {
    const a = encryptSecret("same", "ctx");
    const b = encryptSecret("same", "ctx");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects a different context (row moved to another user)", () => {
    const sealed = encryptSecret("sk-secret", "api_key:u1:openai");
    expect(() => decryptSecret(sealed, "api_key:u2:openai")).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const sealed = encryptSecret("sk-secret", "ctx");
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] ^= 0xff;
    expect(() => decryptSecret({ ...sealed, ciphertext: bytes.toString("base64") }, "ctx")).toThrow();
  });

  it("rejects a secret sealed with another master key", () => {
    const sealed = encryptSecret("sk-secret", "ctx");
    vi.stubEnv("KEYS_ENCRYPTION_KEY", newKey());
    expect(() => decryptSecret(sealed, "ctx")).toThrow(/different key/);
  });

  it("treats a missing or wrong-length key as not configured", () => {
    vi.stubEnv("KEYS_ENCRYPTION_KEY", "");
    expect(isEncryptionConfigured()).toBe(false);
    vi.stubEnv("KEYS_ENCRYPTION_KEY", Buffer.from("too short").toString("base64"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isEncryptionConfigured()).toBe(false);
  });
});
