import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ from?: string }> };

// Landing page (placeholder until the redesign lands in this phase).
export default async function Landing({ searchParams }: Props) {
  // Old re-run links pointed at /?from=<id>; the workspace now lives at /app.
  const { from } = await searchParams;
  if (from) redirect(`/app?from=${encodeURIComponent(from)}`);
  redirect("/app");
}
