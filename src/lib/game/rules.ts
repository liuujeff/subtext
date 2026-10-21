// Game rules shared by the browser and the API. The constants, pointsForRank
// and isTooCloseToClue must match scripts/config.py and scripts/common.py;
// tests/unit/rules.test.ts checks them against tests/fixtures/scoring.json.

export const GUESSES_PER_ROUND = 3;
export const ROUNDS_PER_DAY = 5;
export const RANK_CAP = 25_000;
export const POINTS_CURVE = 0.6;
export const POOL_SIZE = 25_000;

/** Seconds on each round's clock, counted from when the player presses Start. */
export const ROUND_SECONDS = 60;
/**
 * The server still takes a guess this long after the clock runs out (it was
 * fired in time and is still on its way), and keeps the reveal locked until
 * then, so nobody can read the answers and then guess.
 */
export const GRACE_SECONDS = 3;

export const WORD_PATTERN = /^[a-z]+$/;
export const MAX_WORD_LENGTH = 20;

export function normalizeGuess(raw: string): string {
  return raw.trim().toLowerCase();
}

export function pointsForRank(rank: number): number {
  const x = Math.max(0, 1 - Math.log(rank) / Math.log(RANK_CAP));
  return Math.round(100 * x ** POINTS_CURVE);
}

/** Same word, same first 4 letters, or a substring either way (length >= 4). */
export function isTooCloseToClue(guess: string, clue: string): boolean {
  if (guess === clue) return true;
  if (guess.length >= 4 && clue.length >= 4 && guess.slice(0, 4) === clue.slice(0, 4)) return true;
  if (clue.length >= 4 && guess.includes(clue)) return true;
  if (guess.length >= 4 && clue.includes(guess)) return true;
  return false;
}

export function isTooClose(guess: string, a: string, b: string): boolean {
  return isTooCloseToClue(guess, a) || isTooCloseToClue(guess, b);
}

/** Over by guesses: all three used, or a rank-1 hit. The clock can also end a round. */
export function isRoundOver(guesses: readonly { rank: number }[]): boolean {
  return guesses.length >= GUESSES_PER_ROUND || guesses.some((g) => g.rank === 1);
}

export function bestPoints(guesses: readonly { points: number }[]): number {
  return guesses.reduce((best, g) => Math.max(best, g.points), 0);
}

/** The guess that counts: the highest scoring, the earliest of a tie. */
export function bestGuess<G extends { points: number }>(guesses: readonly G[]): G | null {
  return guesses.reduce<G | null>((best, g) => (best && best.points >= g.points ? best : g), null);
}

/** lean = cos(guess, b) - cos(guess, a). */
export function leanText(lean: number, a: string, b: string): string {
  if (Math.abs(lean) < 0.06) return `Balanced between ${a} and ${b}`;
  const side = lean > 0 ? b : a;
  return (Math.abs(lean) > 0.2 ? "Pulled hard toward " : "Leans toward ") + side;
}

export function shareSymbol(points: number): string {
  // Direct hit, hit, splash, miss.
  return points >= 90 ? "🎯" : points >= 60 ? "💥" : points >= 30 ? "🌊" : "🫧";
}
