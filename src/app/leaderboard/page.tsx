import { notFound } from "next/navigation";
import { currentUserId, isAuthConfigured } from "@/auth";
import { getLeaderboard } from "@/server/votes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, PageShell } from "@/components/site/page-header";
import { SignInCard } from "@/components/site/sign-in-card";
import { rankLeaderboard } from "../library/blind";
import { findModel } from "../library/models";
import { modelColor } from "../library/modelColors";
import { signInAction } from "../actions";

// Per request: accounts are configured at runtime (see history/page.tsx).
export const dynamic = "force-dynamic";

export const metadata = { title: "Leaderboard · AI Pasta" };

export default async function LeaderboardPage() {
  if (!isAuthConfigured()) notFound();
  const userId = await currentUserId();

  if (!userId) {
    return (
      <PageShell>
        <PageHeader title="Leaderboard" />
        <SignInCard message="Sign in to build a leaderboard from your blind votes." signIn={signInAction} />
      </PageShell>
    );
  }

  const rows = rankLeaderboard(await getLeaderboard(userId));
  const mostVotes = rows.reduce((max, r) => Math.max(max, r.appearances), 0);

  return (
    <PageShell>
      <PageHeader
        title="Leaderboard"
        description="Built only from your blind votes, where you picked the best answer without seeing model names. Win rate is wins ÷ votes the model answered in."
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          No blind votes yet. Turn on <span className="text-foreground">Blind mode</span> when comparing, then pick the
          best answer.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 pl-4">#</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="w-[38%]">Win rate</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Ties</TableHead>
                <TableHead className="pr-4 text-right">Votes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.modelId}>
                  <TableCell className="pl-4 text-muted-foreground tabular">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className="size-2 rounded-full" style={{ background: modelColor(r.modelId) }} />
                      {findModel(r.modelId)?.label ?? r.modelId}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="w-10 text-right tabular">{Math.round(r.winRate * 100)}%</span>
                      <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.round(r.winRate * 100)}%`, background: modelColor(r.modelId) }}
                        />
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular">{r.wins}</TableCell>
                  <TableCell className="text-right tabular">{r.ties}</TableCell>
                  <TableCell className="pr-4 text-right tabular">{r.appearances}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {rows.length > 0 && mostVotes < 10 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Small sample: with fewer than 10 votes per model, rankings can change quickly.
        </p>
      )}
    </PageShell>
  );
}
