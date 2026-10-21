import { apiError, json, readJson, withPlayer } from "@/lib/api/handler";
import { getGuesses, getPlayablePuzzle, getStarts, isTimeUp, type Puzzle } from "@/lib/api/puzzles";
import {
  GUESSES_PER_ROUND,
  isRoundOver,
  isTooClose,
  MAX_WORD_LENGTH,
  normalizeGuess,
  pointsForRank,
  WORD_PATTERN,
} from "@/lib/game/rules";
import type { Guess, GuessResponse } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Scores one guess. The response carries only points, rank and lean; the
 * guess is stored before the score is returned, so the guess_no constraint
 * caps every player at three scored guesses even under parallel requests.
 * Guesses count only on a started round, until its clock runs out (plus the
 * grace period for guesses still on their way).
 */
export async function POST(request: Request) {
  return withPlayer(request, "guess", async (playerId) => {
    const body = await readJson(request);
    const puzzleId = body?.puzzleId;
    const raw = body?.word;
    if (!Number.isSafeInteger(puzzleId) || typeof raw !== "string" || raw.length > 100) {
      return apiError("bad_request", 400);
    }
    const word = normalizeGuess(raw);

    const db = getSupabaseAdmin();
    const puzzle = await getPlayablePuzzle(db, puzzleId as number);
    if (!puzzle) return apiError("not_found", 404);

    const [guesses, starts] = await Promise.all([
      getGuesses(db, playerId, [puzzle.id]),
      getStarts(db, playerId, [puzzle.id]),
    ]);
    const previous = guesses.get(puzzle.id) ?? [];
    const startedAt = starts.get(puzzle.id);
    if (startedAt === undefined) return apiError("not_started", 409);
    if (isRoundOver(previous) || isTimeUp(startedAt)) return apiError("round_over", 409);
    if (!WORD_PATTERN.test(word) || word.length > MAX_WORD_LENGTH) return apiError("not_in_list", 422);
    if (isTooClose(word, puzzle.word_a, puzzle.word_b)) return apiError("too_close_to_clue", 422);
    if (previous.some((g) => g.word === word)) return apiError("already_guessed", 409);

    const { data: score, error } = await db
      .rpc("score_guess", { p_puzzle_id: puzzle.id, p_word: word })
      .maybeSingle();
    if (error) throw error;
    if (!score) {
      const { data: inflection, error: lookupError } = await db
        .from("inflections")
        .select("base")
        .eq("form", word)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (inflection) return apiError("try_singular", 422, { suggestion: inflection.base });
      const suggestion = await suggestSpelling(db, word, puzzle, previous);
      return apiError("not_in_list", 422, suggestion ? { suggestion } : undefined);
    }

    const points = pointsForRank(score.rank);
    const guessNo = previous.length + 1;
    const { error: insertError } = await db.from("guesses").insert({
      player_id: playerId,
      puzzle_id: puzzle.id,
      guess_no: guessNo,
      word,
      rank: score.rank,
      points,
      lean: score.lean,
    });
    if (insertError) {
      // A parallel request won the race for this guess number or word.
      if (insertError.code === "23505") {
        return insertError.message.includes("_word_")
          ? apiError("already_guessed", 409)
          : apiError("conflict", 409);
      }
      if (insertError.code === "23514") return apiError("round_over", 409);
      throw insertError;
    }

    return json<GuessResponse>({
      points,
      rank: score.rank,
      lean: score.lean,
      over: score.rank === 1 || guessNo >= GUESSES_PER_ROUND,
    });
  });
}

/**
 * The closest real word to a misspelled guess that would be accepted here:
 * not too close to a clue and not already guessed. Ranked by spelling and
 * frequency only (see suggest_words), so it can't hint at answers.
 */
async function suggestSpelling(
  db: ReturnType<typeof getSupabaseAdmin>,
  word: string,
  puzzle: Puzzle,
  previous: Guess[],
): Promise<string | null> {
  const { data, error } = await db.rpc("suggest_words", { p_word: word });
  if (error) throw error;
  const usable = data.find(
    (s) => !isTooClose(s.word, puzzle.word_a, puzzle.word_b) && !previous.some((g) => g.word === s.word),
  );
  return usable?.word ?? null;
}
