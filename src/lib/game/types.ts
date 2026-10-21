import type { Stats } from "./stats";

// Shapes of the /api responses. Nothing here may carry vectors, score arrays
// or answers before a round is over.

export type Guess = { word: string; rank: number; points: number; lean: number };

export type TopAnswer = { word: string; points: number };

/**
 * One round as the server sends it. The pair stays hidden (null) until the
 * player starts the round; msLeft is the time on its clock when the server
 * answered, negative once it has run out, and null before the start.
 */
export type PuzzleRound = {
  puzzleId: number;
  a: string | null;
  b: string | null;
  guesses: Guess[];
  msLeft: number | null;
};

export type TodayResponse = { date: string; rounds: PuzzleRound[] };

export type StartResponse = { a: string; b: string; msLeft: number };

export type GuessResponse = { points: number; rank: number; lean: number; over: boolean };

export type RevealResponse = { top: TopAnswer[] };

export type RandomResponse = PuzzleRound;

export type StatsResponse = Stats;

export type LinkResponse = { merged: boolean };

export type ApiErrorCode =
  | "unauthorized"
  | "bad_request"
  | "rate_limited"
  | "not_found"
  | "no_puzzle"
  | "not_in_list"
  | "too_close_to_clue"
  | "try_singular"
  | "already_guessed"
  | "not_started"
  | "round_over"
  | "round_not_over"
  | "conflict"
  | "server_error";

export type ApiErrorBody = { error: ApiErrorCode; suggestion?: string; date?: string };
