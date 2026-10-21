// Streaks and stats from a player's finished dailies. Shared by the API (which
// computes them) and the browser (which shows them).

import { ROUNDS_PER_DAY } from "./rules";

/** One daily the player has played, from the `daily_results` database function. */
export type DayResult = { date: string; finished: number; points: number; hits: number };

export type Stats = {
  /** Days with all five rounds finished. */
  daysCompleted: number;
  /** Consecutive completed days up to today (or yesterday, while today is still open). */
  currentStreak: number;
  bestStreak: number;
  /** Average and best total over completed days; null before the first. */
  averageScore: number | null;
  bestScore: number | null;
  /** Rounds finished on daily days, and how many found the best word. */
  roundsPlayed: number;
  bestWordHits: number;
};

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

/**
 * A day counts once all its rounds are finished. The streak survives until
 * the end of the day after the last completed one, so it isn't lost while
 * today's pairs are still waiting.
 */
export function computeStats(days: DayResult[], today: string): Stats {
  const done = days.filter((d) => d.finished >= ROUNDS_PER_DAY).sort((a, b) => a.date.localeCompare(b.date));

  let best = 0;
  let run = 0;
  done.forEach((d, i) => {
    run = i > 0 && daysBetween(done[i - 1].date, d.date) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  const last = done[done.length - 1];
  const current = last && daysBetween(last.date, today) <= 1 ? run : 0;

  const totals = done.map((d) => d.points);
  return {
    daysCompleted: done.length,
    currentStreak: current,
    bestStreak: best,
    averageScore: totals.length ? Math.round(totals.reduce((s, p) => s + p, 0) / totals.length) : null,
    bestScore: totals.length ? Math.max(...totals) : null,
    roundsPlayed: days.reduce((s, d) => s + d.finished, 0),
    bestWordHits: days.reduce((s, d) => s + d.hits, 0),
  };
}
