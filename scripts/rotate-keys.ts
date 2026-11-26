/**
 * Re-encrypts saved API keys with the current KEYS_ENCRYPTION_KEY.
 *
 * Rotation:
 *   1. Set KEYS_ENCRYPTION_KEY_PREVIOUS to the old key and KEYS_ENCRYPTION_KEY
 *      to a new one (openssl rand -base64 32), then deploy. Saved keys keep
 *      working because decryption accepts either key.
 *   2. Run: npm run keys:rotate -- --dry-run   (reports what would change)
 *           npm run keys:rotate                (re-encrypts)
 *   3. Once it reports 0 remaining, remove KEYS_ENCRYPTION_KEY_PREVIOUS.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Imported after the env is loaded: the DB client reads DATABASE_URL on import.
  const { and, eq, ne } = await import("drizzle-orm");
  const { db } = await import("../src/server/db");
  const { apiKeys } = await import("../src/server/db/schema");
  const { currentKeyId, decryptSecret, encryptSecret } = await import("../src/server/crypto");
  const { apiKeyContext } = await import("../src/server/apiKeyContext");

  const keyId = currentKeyId();
  if (!keyId) throw new Error("KEYS_ENCRYPTION_KEY is missing or invalid.");

  const stale = await db.select().from(apiKeys).where(ne(apiKeys.keyId, keyId));
  console.log(`${stale.length} key(s) not encrypted with the current key (${keyId}).`);

  let rotated = 0;
  const failed: string[] = [];
  for (const row of stale) {
    const label = `${row.userId}/${row.provider}`;
    try {
      const context = apiKeyContext(row.userId, row.provider);
      const sealed = encryptSecret(decryptSecret(row, context), context);
      if (!dryRun) {
        await db
          .update(apiKeys)
          .set({ ...sealed, updatedAt: new Date() })
          // Only if unchanged since we read it, so a concurrent re-save wins.
          .where(
            and(eq(apiKeys.userId, row.userId), eq(apiKeys.provider, row.provider), eq(apiKeys.keyId, row.keyId))
          );
      }
      rotated++;
    } catch {
      failed.push(label);
    }
  }

  console.log(`${dryRun ? "Would re-encrypt" : "Re-encrypted"}: ${rotated}`);
  if (failed.length) {
    console.log(
      `Could not decrypt ${failed.length} (encrypted with a key that isn't KEYS_ENCRYPTION_KEY or ` +
        `KEYS_ENCRYPTION_KEY_PREVIOUS; those users must re-save): ${failed.join(", ")}`
    );
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
