import { apiError, json, readJson, withPlayer } from "@/lib/api/handler";
import { getGuesses, getStarts, isTimeUp, roundFor } from "@/lib/api/puzzles";
import { isRoundOver } from "@/lib/game/rules";
import type { RandomResponse } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * A random-mode pair, preferring ones this player hasn't finished. Random
 * pairs are separate from the daily schedule, so they never preview a future
 * day, and they carry the same rules: 3 guesses, and a pair hidden until the
 * player starts its clock.
 */
export async function POST(request: Request) {
  return withPlayer(request, "read", async (playerId) => {
    const body = await readJson(request);
    const exclude = Number.isSafeInteger(body?.exclude) ? (body?.exclude as number) : null;

    const db = getSupabaseAdmin();
    const { data: pool, error } = await db.from("puzzles").select("id").eq("kind", "random");
    if (error) throw error;
    if (!pool.length) return apiError("no_puzzle", 404);

    const ids = pool.map((p) => p.id);
    const [played, starts] = await Promise.all([getGuesses(db, playerId, ids), getStarts(db, playerId, ids)]);
    const others = ids.filter((id) => id !== exclude);
    const fresh = others.filter((id) => !isRoundOver(played.get(id) ?? []) && !isTimeUp(starts.get(id)));
    const choices = fresh.length ? fresh : others.length ? others : ids;
    const id = choices[Math.floor(Math.random() * choices.length)];

    const { data: puzzle, error: puzzleError } = await db
      .from("puzzles")
      .select("id, word_a, word_b")
      .eq("id", id)
      .single();
    if (puzzleError) throw puzzleError;

    return json<RandomResponse>(roundFor(puzzle, played.get(id) ?? [], starts.get(id)));
  });
}
