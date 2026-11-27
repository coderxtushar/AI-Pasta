// Blind mode helpers (client-safe).

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** "Model A", "Model B", … for position `index` in the shuffled order. */
export function blindLabel(index: number): string {
  return `Model ${String.fromCharCode(65 + index)}`;
}

export type LeaderboardRow = {
  modelId: string;
  /** Blind votes where this model gave an answer. */
  appearances: number;
  wins: number;
  ties: number;
};

export type RankedRow = LeaderboardRow & { winRate: number };

/** Sorts by win rate, then wins, then appearances. */
export function rankLeaderboard(rows: LeaderboardRow[]): RankedRow[] {
  return rows
    .map((r) => ({ ...r, winRate: r.appearances ? r.wins / r.appearances : 0 }))
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.appearances - a.appearances);
}
