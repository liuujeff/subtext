import { apiError, json, withPlayer } from "@/lib/api/handler";
import { getGuesses, getPlayablePuzzle, getStarts, isTimeUp } from "@/lib/api/puzzles";
import { isRoundOver } from "@/lib/game/rules";
import type { RevealResponse, TopAnswer } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * The strongest answers for a pair, only once this player's round is over: by
 * guesses, or by the clock once its grace period has passed too.
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
    if (!isRoundOver(guesses.get(puzzle.id) ?? []) && !isTimeUp(starts.get(puzzle.id))) {
      return apiError("round_not_over", 403);
    }

    const { data, error } = await db.from("puzzles").select("top_answers").eq("id", puzzle.id).single();
    if (error) throw error;
    return json<RevealResponse>({ top: data.top_answers as TopAnswer[] });
  });
}
