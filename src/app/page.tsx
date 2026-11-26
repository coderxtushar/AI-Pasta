import { currentUserId, isAuthConfigured } from "@/auth";
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

  return (
    <Compare
      key={from ?? "new"}
      signedIn={userId !== null}
      authEnabled={isAuthConfigured()}
      initialPrompt={initial?.prompt}
      initialModels={initial?.models}
    />
  );
}
