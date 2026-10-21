import { json, withPlayer } from "@/lib/api/handler";
import { todayInNewYork } from "@/lib/game/day";
import { GRACE_SECONDS, ROUND_SECONDS, ROUNDS_PER_DAY } from "@/lib/game/rules";
import type { DistributionResponse } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** How today's totals spread across everyone who has finished the day, and where this player's falls. */
export async function GET(request: Request) {
  return withPlayer(request, "read", async (playerId) => {
    const db = getSupabaseAdmin();
    const date = todayInNewYork();
    const expire = ROUND_SECONDS + GRACE_SECONDS;

    const mine = await db.rpc("daily_results", { p_player: playerId, p_expire_secs: expire });
    if (mine.error) throw mine.error;
    const today = mine.data.find((d) => d.play_date === date && d.finished >= ROUNDS_PER_DAY);
    const total = today ? today.points : null;

    const everyone = await db.rpc("day_distribution", {
      p_date: date,
      p_expire_secs: expire,
      p_rounds: ROUNDS_PER_DAY,
      p_total: total ?? -1, // nobody is below -1
    });
    if (everyone.error) throw everyone.error;
    const { players, mean, sd, below } = everyone.data[0] ?? { players: 0, mean: 0, sd: 0, below: 0 };

    return json<DistributionResponse>({
      date,
      players,
      mean: Math.round(mean * 10) / 10,
      sd: Math.round(sd * 10) / 10,
      total,
      below: total === null ? null : below,
    });
  });
}
