// A day runs midnight to midnight in New York, for every player. Keep in sync
// with TIMEZONE and DAILY_START in scripts/config.py.

export const TIME_ZONE = "America/New_York";
export const DAILY_START = "2026-10-21"; // Day 1

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in New York as YYYY-MM-DD. */
export function todayInNewYork(now: Date = new Date()): string {
  return formatter.format(now);
}

export function dayNumber(date: string): number {
  return Math.round((Date.parse(date) - Date.parse(DAILY_START)) / 86_400_000) + 1;
}
