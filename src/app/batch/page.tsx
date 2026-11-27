import { currentUserId } from "@/auth";
import { isKeyStorageEnabled, listApiKeys } from "@/server/apiKeys";
import BatchRunner from "../components/BatchRunner";

// Per request: sign-in state comes from runtime env and cookies (see history/page.tsx).
export const dynamic = "force-dynamic";

export const metadata = { title: "Batch · AI Pasta" };

export default async function BatchPage() {
  const userId = await currentUserId();
  // Same key rules as the compare page: account keys when available, else this browser's.
  const accountKeys = userId && isKeyStorageEnabled() ? await listApiKeys(userId).catch(() => null) : null;
  return <BatchRunner signedIn={userId !== null} accountKeys={accountKeys} />;
}
