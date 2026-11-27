import { notFound } from "next/navigation";
import { currentUserId, isAuthConfigured } from "@/auth";
import { getLeaderboard } from "@/server/votes";
import { rankLeaderboard } from "../library/blind";
import { findModel } from "../library/models";
import { signInAction } from "../actions";

// Per request: accounts are configured at runtime (see history/page.tsx).
export const dynamic = "force-dynamic";

export const metadata = { title: "Leaderboard · AI Pasta" };

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "left" };
const num: React.CSSProperties = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };

export default async function LeaderboardPage() {
  if (!isAuthConfigured()) notFound();
  const userId = await currentUserId();

  if (!userId) {
    return (
      <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        <h1>Leaderboard</h1>
        <p style={{ color: "#6b7280" }}>Sign in to build a leaderboard from your blind votes.</p>
        <form action={signInAction}>
          <button type="submit" style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
            Sign in with Google
          </button>
        </form>
      </main>
    );
  }

  const rows = rankLeaderboard(await getLeaderboard(userId));
  const totalVotes = rows.reduce((max, r) => Math.max(max, r.appearances), 0);

  return (
    <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Leaderboard</h1>
      <p style={{ marginTop: 0, color: "#6b7280", fontSize: 14 }}>
        Built only from your blind votes, where you picked the best answer without seeing model names. Win rate is
        wins ÷ votes the model answered in.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "#6b7280" }}>
          No blind votes yet. Turn on <strong>Blind mode</strong> when comparing, then pick the best answer.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ color: "#6b7280" }}>
              <th style={cell}>#</th>
              <th style={cell}>Model</th>
              <th style={num}>Win rate</th>
              <th style={num}>Wins</th>
              <th style={num}>Ties</th>
              <th style={num}>Votes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.modelId}>
                <td style={cell}>{i + 1}</td>
                <td style={cell}>{findModel(r.modelId)?.label ?? r.modelId}</td>
                <td style={num}>{Math.round(r.winRate * 100)}%</td>
                <td style={num}>{r.wins}</td>
                <td style={num}>{r.ties}</td>
                <td style={num}>{r.appearances}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 0 && totalVotes < 10 && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Small sample: with fewer than 10 votes per model, rankings can change quickly.
        </p>
      )}
    </main>
  );
}
