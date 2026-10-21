import { apiError, json, readJson, withPlayer } from "@/lib/api/handler";
import { getPlayablePuzzle, msLeft, startRound } from "@/lib/api/puzzles";
import type { StartResponse } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Starts the player's clock on a round and returns its pair, which no other
 * route shows before the start. Starting again keeps the first start.
 */
export async function POST(request: Request) {
  return withPlayer(request, "read", async (playerId) => {
    const body = await readJson(request);
    const puzzleId = body?.puzzleId;
    if (!Number.isSafeInteger(puzzleId)) return apiError("bad_request", 400);

    const db = getSupabaseAdmin();
    const puzzle = await getPlayablePuzzle(db, puzzleId as number);
    if (!puzzle) return apiError("not_found", 404);

    const startedAt = await startRound(db, playerId, puzzle.id);
    return json<StartResponse>({ a: puzzle.word_a, b: puzzle.word_b, msLeft: msLeft(startedAt) });
  });
}
