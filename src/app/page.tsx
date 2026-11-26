import { currentUserId, isAuthConfigured } from "@/auth";
import { isKeyStorageEnabled, listApiKeys } from "@/server/apiKeys";
import { getComparisonForViewer } from "@/server/comparisons";
import Compare from "./components/Compare";
import { findModel } from "./library/models";

type Props = { searchParams: Promise<{ from?: string }> };

export default async function Home({ searchParams }: Props) {
  const { from } = await searchParams;
  const userId = await currentUserId();

  // "Re-run" links land here as /?from=<comparisonId>.
  let initial: { prompt: string; models: string[] } | undefined;
  if (from) {
    const found = await getComparisonForViewer(from, userId).catch(() => null);
    if (found) {
      initial = {
        prompt: found.comparison.prompt,
        models: found.comparison.models.filter((id) => findModel(id)),
      };
    }
  }

  // Hints for keys saved to the account. Null falls back to browser-held keys,
  // including when the lookup fails, so comparing keeps working.
  const accountKeys =
    userId && isKeyStorageEnabled() ? await listApiKeys(userId).catch(() => null) : null;

  return (
    <Compare
      key={from ?? "new"}
      signedIn={userId !== null}
      authEnabled={isAuthConfigured()}
      accountKeys={accountKeys}
      initialPrompt={initial?.prompt}
      initialModels={initial?.models}
    />
  );
}
