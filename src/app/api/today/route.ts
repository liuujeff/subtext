import { apiError, json, withPlayer } from "@/lib/api/handler";
import { getGuesses, getStarts, roundFor } from "@/lib/api/puzzles";
import { todayInNewYork } from "@/lib/game/day";
import type { TodayResponse } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Today's rounds, with the player's guesses so far; each pair only once its round has started. */
export async function GET(request: Request) {
  return withPlayer(request, "read", async (playerId) => {
    const db = getSupabaseAdmin();
    const date = todayInNewYork();
    const { data: puzzles, error } = await db
      .from("puzzles")
      .select("id, word_a, word_b")
      .eq("kind", "daily")
      .eq("play_date", date)
      .order("round");
    if (error) throw error;
    if (!puzzles.length) return apiError("no_puzzle", 404, { date });

    const ids = puzzles.map((p) => p.id);
    const [guesses, starts] = await Promise.all([getGuesses(db, playerId, ids), getStarts(db, playerId, ids)]);
    return json<TodayResponse>({
      date,
      rounds: puzzles.map((p) => roundFor(p, guesses.get(p.id) ?? [], starts.get(p.id))),
    });
  });
}
