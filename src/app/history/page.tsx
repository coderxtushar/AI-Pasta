import Link from "next/link";
import { notFound } from "next/navigation";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { currentUserId, isAuthConfigured } from "@/auth";
import { listComparisons } from "@/server/comparisons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageShell } from "@/components/site/page-header";
import { SignInCard } from "@/components/site/sign-in-card";
import { findModel } from "../library/models";
import { modelColor } from "../library/modelColors";
import { deleteComparisonAction, signInAction } from "../actions";

// Always render per request: whether accounts are enabled is read from runtime
// env vars, and a build without them must not bake in a static 404.
export const dynamic = "force-dynamic";

export const metadata = { title: "History · AI Pasta" };

type Props = { searchParams: Promise<{ q?: string }> };

function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "brand" | "success" }) {
  const tones = {
    default: "bg-muted text-muted-foreground",
    brand: "bg-brand/15 text-brand",
    success: "bg-success/15 text-success",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export default async function HistoryPage({ searchParams }: Props) {
  if (!isAuthConfigured()) notFound();
  const { q } = await searchParams;
  const userId = await currentUserId();

  if (!userId) {
    return (
      <PageShell>
        <PageHeader title="History" />
        <SignInCard message="Sign in to see the comparisons you've run." signIn={signInAction} />
      </PageShell>
    );
  }

  const items = await listComparisons(userId, q);

  return (
    <PageShell>
      <PageHeader title="History" description="Every comparison you've run while signed in. Open one to share or export it." />

      <form method="get" role="search" className="relative mb-4">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q ?? ""} placeholder="Search prompts…" aria-label="Search prompts" className="h-10 pl-9" />
        <button type="submit" className="sr-only">
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          {q ? `No comparisons match “${q}”.` : "No comparisons yet. Run one and it will show up here."}
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((c) => (
            <li key={c.id} className="group flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-accent/40">
              <div className="min-w-0 flex-1 basis-80">
                <Link
                  href={`/c/${c.id}`}
                  className="line-clamp-2 text-sm font-medium whitespace-pre-wrap text-foreground hover:underline"
                >
                  {c.prompt}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {c.models.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1">
                        <span aria-hidden className="size-1.5 rounded-full" style={{ background: modelColor(id) }} />
                        {findModel(id)?.label ?? id}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.isPublic && <Tag tone="success">Shared</Tag>}
                {c.blind && <Tag tone="brand">Blind</Tag>}
                {c.followUps.length > 0 && <Tag>{c.followUps.length + 1} turns</Tag>}
                <time dateTime={c.createdAt.toISOString()} className="text-xs whitespace-nowrap text-muted-foreground tabular">
                  {c.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </time>
                <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                  <Link href={`/app?from=${c.id}`}>
                    <RotateCcw className="size-3.5" /> Re-run
                  </Link>
                </Button>
                <form action={deleteComparisonAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button type="submit" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-danger hover:text-danger">
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
