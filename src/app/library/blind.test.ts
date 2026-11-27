import { describe, expect, it } from "vitest";
import { blindLabel, rankLeaderboard, shuffle } from "./blind";

describe("shuffle", () => {
  it("keeps every item and doesn't mutate the input", () => {
    const input = ["a", "b", "c", "d"];
    const out = shuffle(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual(["a", "b", "c", "d"]);
  });

  it("is uniform enough that every item lands first sometimes", () => {
    const firsts = new Set<string>();
    for (let i = 0; i < 200; i++) firsts.add(shuffle(["a", "b", "c"])[0]);
    expect(firsts).toEqual(new Set(["a", "b", "c"]));
  });

  it("is deterministic with a fixed random source", () => {
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });
});

describe("blindLabel", () => {
  it("labels positions A, B, C…", () => {
    expect([0, 1, 5].map(blindLabel)).toEqual(["Model A", "Model B", "Model F"]);
  });
});

describe("rankLeaderboard", () => {
  it("ranks by win rate, then wins, then appearances", () => {
    const ranked = rankLeaderboard([
      { modelId: "low", appearances: 4, wins: 1, ties: 0 },
      { modelId: "high-few", appearances: 2, wins: 2, ties: 0 },
      { modelId: "high-many", appearances: 4, wins: 4, ties: 0 },
      { modelId: "none", appearances: 0, wins: 0, ties: 0 },
    ]);
    expect(ranked.map((r) => r.modelId)).toEqual(["high-many", "high-few", "low", "none"]);
    expect(ranked[2].winRate).toBe(0.25);
  });
});
