import { json, withPlayer } from "@/lib/api/handler";
import { todayInNewYork } from "@/lib/game/day";
import { GRACE_SECONDS, ROUND_SECONDS } from "@/lib/game/rules";
import { computeStats } from "@/lib/game/stats";
import type { StatsResponse } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** The player's streaks and stats, from the dailies they've played. */
export async function GET(request: Request) {
  return withPlayer(request, "read", async (playerId) => {
    const { data, error } = await getSupabaseAdmin().rpc("daily_results", {
      p_player: playerId,
      p_expire_secs: ROUND_SECONDS + GRACE_SECONDS,
    });
    if (error) throw error;
    const days = data.map((d) => ({ date: d.play_date, finished: d.finished, points: d.points, hits: d.hits }));
    return json<StatsResponse>(computeStats(days, todayInNewYork()));
  });
}
