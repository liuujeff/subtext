import { describe, expect, it } from "vitest";

import { isRateLimited } from "@/lib/api/rate-limit";
import { DAILY_START, dayNumber, todayInNewYork } from "@/lib/game/day";
import {
  GUESSES_PER_ROUND,
  isRoundOver,
  isTooCloseToClue,
  leanText,
  pointsForRank,
  POOL_SIZE,
  RANK_KNOTS,
  ROUNDS_PER_DAY,
  shareSymbol,
} from "@/lib/game/rules";

import fixtures from "../fixtures/scoring.json";

describe("matches the Python pipeline (tests/fixtures/scoring.json)", () => {
  it("uses the same constants", () => {
    expect({ RANK_KNOTS, GUESSES: GUESSES_PER_ROUND, ROUNDS_PER_DAY, POOL_SIZE, DAILY_START }).toEqual(
      fixtures.constants,
    );
  });

  it.each(fixtures.points)("pointsForRank(%i) = %i", (rank, points) => {
    expect(pointsForRank(rank)).toBe(points);
  });

  it.each(fixtures.forbidden as [string, string, boolean][])(
    "isTooCloseToClue(%s, %s) = %s",
    (guess, clue, expected) => {
      expect(isTooCloseToClue(guess, clue)).toBe(expected);
    },
  );

  it("agrees on points for every fixture guess", () => {
    for (const g of fixtures.guesses) expect(pointsForRank(g.rank)).toBe(g.points);
  });
});

describe("rules", () => {
  it("ends a round after three guesses or a rank-1 guess", () => {
    expect(isRoundOver([{ rank: 5 }, { rank: 9 }])).toBe(false);
    expect(isRoundOver([{ rank: 5 }, { rank: 9 }, { rank: 40 }])).toBe(true);
    expect(isRoundOver([{ rank: 1 }])).toBe(true);
  });

  it("describes lean with the prototype's thresholds", () => {
    expect(leanText(0.05, "camel", "ship")).toBe("Balanced between camel and ship");
    expect(leanText(0.1, "camel", "ship")).toBe("Leans toward ship");
    expect(leanText(-0.1, "camel", "ship")).toBe("Leans toward camel");
    expect(leanText(-0.25, "camel", "ship")).toBe("Pulled hard toward camel");
  });

  it("maps scores to share symbols", () => {
    expect([95, 80, 79, 55, 54, 35, 34, 0].map(shareSymbol)).toEqual(["🎯", "🎯", "💥", "💥", "🌊", "🌊", "🫧", "🫧"]);
  });
});

describe("day", () => {
  it("counts Day 1 from DAILY_START", () => {
    expect(dayNumber(DAILY_START)).toBe(1);
    expect(dayNumber("2026-11-03")).toBe(14);
  });

  it("uses the New York date, not UTC", () => {
    expect(todayInNewYork(new Date("2026-10-22T03:30:00Z"))).toBe("2026-10-21"); // 11:30pm EDT
    expect(todayInNewYork(new Date("2026-10-22T04:30:00Z"))).toBe("2026-10-22");
    expect(todayInNewYork(new Date("2026-12-01T04:30:00Z"))).toBe("2026-11-30"); // EST
  });
});

describe("rate limit", () => {
  it("allows `limit` hits per window", () => {
    const limit = { limit: 2, windowMs: 1000 };
    expect(isRateLimited("k", limit, 0)).toBe(false);
    expect(isRateLimited("k", limit, 10)).toBe(false);
    expect(isRateLimited("k", limit, 20)).toBe(true);
    expect(isRateLimited("k", limit, 1001)).toBe(false);
  });
});
