import { apiError, json, withPlayer } from "@/lib/api/handler";
import { getGuesses, getPlayablePuzzle, getStarts, isTimeUp } from "@/lib/api/puzzles";
import { BETTER_WORD_MAX, bestPoints, isRoundOver, pointsForRank } from "@/lib/game/rules";
import type { BetterResponse, TopAnswer } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * A word that would have beaten the player's best, once their round is over
 * (locked like /api/reveal) and only if that best was BETTER_WORD_MAX or less.
 * It's the weakest of the pair's top answers, never the first: the best word
 * itself stays unnamed. Its points are scored now, since the stored ones are
 * left as they were for puzzles already played.
 */
export async function GET(request: Request) {
  return withPlayer(request, "read", async (playerId) => {
    const puzzleId = Number(new URL(request.url).searchParams.get("puzzleId"));
    if (!Number.isSafeInteger(puzzleId)) return apiError("bad_request", 400);

    const db = getSupabaseAdmin();
    const puzzle = await getPlayablePuzzle(db, puzzleId);
    if (!puzzle) return apiError("not_found", 404);

    const [guesses, starts] = await Promise.all([
      getGuesses(db, playerId, [puzzle.id]),
      getStarts(db, playerId, [puzzle.id]),
    ]);
    const mine = guesses.get(puzzle.id) ?? [];
    if (!isRoundOver(mine) && !isTimeUp(starts.get(puzzle.id))) return apiError("round_not_over", 403);
    const best = bestPoints(mine);
    if (best > BETTER_WORD_MAX) return json<BetterResponse>({ better: null });

    const { data, error } = await db.from("puzzles").select("top_answers").eq("id", puzzle.id).single();
    if (error) throw error;
    const word = (data.top_answers as TopAnswer[]).slice(1).at(-1)?.word;
    if (!word) return json<BetterResponse>({ better: null });

    const { data: score, error: scoreError } = await db
      .rpc("score_guess", { p_puzzle_id: puzzle.id, p_word: word })
      .maybeSingle();
    if (scoreError) throw scoreError;
    const points = score ? pointsForRank(score.rank) : 0;
    return json<BetterResponse>({ better: points > best ? { word, points } : null });
  });
}
