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

const warned = new Set<string>();

function readKey(envName: "KEYS_ENCRYPTION_KEY" | "KEYS_ENCRYPTION_KEY_PREVIOUS"): Buffer | null {
  const raw = process.env[envName];
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    if (!warned.has(envName)) {
      console.error(`${envName} must be 32 bytes, base64-encoded. It is being ignored.`);
      warned.add(envName);
    }
    return null;
  }
  return key;
}

/** The key new secrets are encrypted with. */
const currentKey = () => readKey("KEYS_ENCRYPTION_KEY");

export function fingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** True when a valid KEYS_ENCRYPTION_KEY is configured. */
export function isEncryptionConfigured(): boolean {
  return currentKey() !== null;
}

/** Fingerprint of the current key, or null when none is configured. */
export function currentKeyId(): string | null {
  const key = currentKey();
  return key ? fingerprint(key) : null;
}

/**
 * Encrypts `plaintext`. `context` is bound as additional authenticated data, so
 * the ciphertext only decrypts with the same context (e.g. the same user + provider).
 */
export function encryptSecret(plaintext: string, context: string): SealedSecret {
  const key = currentKey();
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

/**
 * Decrypts with whichever configured key matches `sealed.keyId`: the current
 * key, or KEYS_ENCRYPTION_KEY_PREVIOUS during a rotation.
 */
export function decryptSecret(sealed: SealedSecret, context: string): string {
  const key = [currentKey(), readKey("KEYS_ENCRYPTION_KEY_PREVIOUS")].find(
    (k): k is Buffer => k !== null && fingerprint(k) === sealed.keyId
  );
  if (!key) throw new Error("Secret was encrypted with a different key.");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, "base64"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
