import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM: authenticated encryption, so tampered ciphertext fails to decrypt
// instead of producing garbage.
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export type SealedSecret = {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  /** Fingerprint of the master key used, so a key rotation can find old rows. */
  keyId: string;
};

let warned = false;

function getMasterKey(): Buffer | null {
  const raw = process.env.KEYS_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    if (!warned) {
      console.error("KEYS_ENCRYPTION_KEY must be 32 bytes, base64-encoded. Account key storage is disabled.");
      warned = true;
    }
    return null;
  }
  return key;
}

function fingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** True when a valid KEYS_ENCRYPTION_KEY is configured. */
export function isEncryptionConfigured(): boolean {
  return getMasterKey() !== null;
}

/**
 * Encrypts `plaintext`. `context` is bound as additional authenticated data, so
 * the ciphertext only decrypts with the same context (e.g. the same user + provider).
 */
export function encryptSecret(plaintext: string, context: string): SealedSecret {
  const key = getMasterKey();
  if (!key) throw new Error("Encryption key is not configured.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyId: fingerprint(key),
  };
}

export function decryptSecret(sealed: SealedSecret, context: string): string {
  const key = getMasterKey();
  if (!key) throw new Error("Encryption key is not configured.");
  if (sealed.keyId !== fingerprint(key)) {
    throw new Error("Secret was encrypted with a different key.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, "base64"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
