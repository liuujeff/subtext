import "server-only";

import { todayInNewYork } from "@/lib/game/day";
import { GRACE_SECONDS, ROUND_SECONDS } from "@/lib/game/rules";
import type { Guess, PuzzleRound } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Db = ReturnType<typeof getSupabaseAdmin>;

export type Puzzle = { id: number; kind: string; play_date: string | null; word_a: string; word_b: string };

/**
 * A puzzle the player may see: any random-mode pair, or a daily pair that
 * isn't in the future. Future puzzles look exactly like missing ones.
 */
export async function getPlayablePuzzle(db: Db, id: number): Promise<Puzzle | null> {
  const { data, error } = await db
    .from("puzzles")
    .select("id, kind, play_date, word_a, word_b")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.kind === "daily" && (!data.play_date || data.play_date > todayInNewYork())) return null;
  return data;
}

/** The player's guesses for each puzzle, in the order they were made. */
export async function getGuesses(db: Db, playerId: string, puzzleIds: number[]): Promise<Map<number, Guess[]>> {
  const byPuzzle = new Map<number, Guess[]>(puzzleIds.map((id) => [id, []]));
  if (!puzzleIds.length) return byPuzzle;

  const { data, error } = await db
    .from("guesses")
    .select("puzzle_id, word, rank, points, lean")
    .eq("player_id", playerId)
    .in("puzzle_id", puzzleIds)
    .order("guess_no");
  if (error) throw error;

  for (const { puzzle_id, ...guess } of data) byPuzzle.get(puzzle_id)?.push(guess);
  return byPuzzle;
}

/** When the player started each of these rounds (ms since the epoch); missing if not started. */
export async function getStarts(db: Db, playerId: string, puzzleIds: number[]): Promise<Map<number, number>> {
  const starts = new Map<number, number>();
  if (!puzzleIds.length) return starts;

  const { data, error } = await db
    .from("round_starts")
    .select("puzzle_id, started_at")
    .eq("player_id", playerId)
    .in("puzzle_id", puzzleIds);
  if (error) throw error;

  for (const { puzzle_id, started_at } of data) starts.set(puzzle_id, Date.parse(started_at));
  return starts;
}

/**
 * Starts the player's clock on a round, or keeps the start it already has, so
 * reloading never resets the clock. Returns the start. The start time comes
 * from this server's clock, like the `now` it's compared with.
 */
export async function startRound(db: Db, playerId: string, puzzleId: number): Promise<number> {
  const { error } = await db
    .from("round_starts")
    .upsert(
      { player_id: playerId, puzzle_id: puzzleId, started_at: new Date().toISOString() },
      { onConflict: "player_id,puzzle_id", ignoreDuplicates: true },
    );
  if (error) throw error;
  const startedAt = (await getStarts(db, playerId, [puzzleId])).get(puzzleId);
  if (startedAt === undefined) throw new Error(`round ${puzzleId} has no start after starting it`);
  return startedAt;
}

/** Time left on a round's clock in ms, negative once it has run out; null if not started. */
export function msLeft(startedAt: number, now?: number): number;
export function msLeft(startedAt: number | undefined, now?: number): number | null;
export function msLeft(startedAt: number | undefined, now = Date.now()): number | null {
  return startedAt === undefined ? null : ROUND_SECONDS * 1000 - (now - startedAt);
}

/** True once a started round's clock, and the grace period after it, have run out. */
export function isTimeUp(startedAt: number | undefined, now = Date.now()): boolean {
  const left = msLeft(startedAt, now);
  return left !== null && left <= -GRACE_SECONDS * 1000;
}

/** A round for the browser: its pair only once the player has started it. */
export function roundFor(
  puzzle: { id: number; word_a: string; word_b: string },
  guesses: Guess[],
  startedAt: number | undefined,
): PuzzleRound {
  const started = startedAt !== undefined;
  return {
    puzzleId: puzzle.id,
    a: started ? puzzle.word_a : null,
    b: started ? puzzle.word_b : null,
    guesses,
    msLeft: msLeft(startedAt),
  };
}
