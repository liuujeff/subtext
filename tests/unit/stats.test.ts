import { describe, expect, it } from "vitest";

import { computeStats, type DayResult } from "@/lib/game/stats";

const day = (date: string, points = 300, finished = 5, hits = 0): DayResult => ({ date, finished, points, hits });

describe("computeStats", () => {
  it("is empty before any play", () => {
    expect(computeStats([], "2026-10-21")).toEqual({
      daysCompleted: 0,
      currentStreak: 0,
      bestStreak: 0,
      averageScore: null,
      bestScore: null,
      roundsPlayed: 0,
      bestWordHits: 0,
    });
  });

  it("counts a run of consecutive days ending today", () => {
    const s = computeStats([day("2026-10-21", 200), day("2026-10-22", 400), day("2026-10-23", 300)], "2026-10-23");
    expect(s).toMatchObject({ currentStreak: 3, bestStreak: 3, daysCompleted: 3, averageScore: 300, bestScore: 400 });
  });

  it("keeps the streak alive until the end of the next day", () => {
    const days = [day("2026-10-21"), day("2026-10-22")];
    expect(computeStats(days, "2026-10-23").currentStreak).toBe(2);
    expect(computeStats(days, "2026-10-24").currentStreak).toBe(0);
    expect(computeStats(days, "2026-10-24").bestStreak).toBe(2);
  });

  it("restarts after a missed day and keeps the best run", () => {
    const days = [day("2026-10-21"), day("2026-10-22"), day("2026-10-23"), day("2026-10-25"), day("2026-10-26")];
    expect(computeStats(days, "2026-10-26")).toMatchObject({ currentStreak: 2, bestStreak: 3 });
  });

  it("ignores days with unfinished rounds, but counts their rounds", () => {
    const s = computeStats([day("2026-10-21"), day("2026-10-22", 120, 3, 1), day("2026-10-23")], "2026-10-23");
    expect(s).toMatchObject({ currentStreak: 1, bestStreak: 1, daysCompleted: 2, roundsPlayed: 13, bestWordHits: 1 });
  });

  it("handles month and year boundaries, and unsorted input", () => {
    const days = [day("2027-01-01"), day("2026-12-31"), day("2026-12-30")];
    expect(computeStats(days, "2027-01-01")).toMatchObject({ currentStreak: 3, bestStreak: 3 });
  });
});
