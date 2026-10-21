import { json, withPlayer } from "@/lib/api/handler";
import { todayInNewYork } from "@/lib/game/day";
import { GRACE_SECONDS, ROUND_SECONDS, ROUNDS_PER_DAY } from "@/lib/game/rules";
import type { DistributionResponse } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKETS = 10; // 50 points each, for a 500-point day

/** How today's totals spread across everyone who has finished the day, and where this player's falls. */
export async function GET(request: Request) {
  return withPlayer(request, "read", async (playerId) => {
    const db = getSupabaseAdmin();
    const date = todayInNewYork();
    const expire = ROUND_SECONDS + GRACE_SECONDS;
    const [everyone, mine] = await Promise.all([
      db.rpc("day_distribution", { p_date: date, p_expire_secs: expire, p_rounds: ROUNDS_PER_DAY }),
      db.rpc("daily_results", { p_player: playerId, p_expire_secs: expire }),
    ]);
    if (everyone.error) throw everyone.error;
    if (mine.error) throw mine.error;

    const buckets = Array<number>(BUCKETS).fill(0);
    for (const row of everyone.data) buckets[row.bucket] = row.players;
    const today = mine.data.find((d) => d.play_date === date && d.finished >= ROUNDS_PER_DAY);
    return json<DistributionResponse>({
      date,
      buckets,
      players: buckets.reduce((sum, n) => sum + n, 0),
      total: today ? today.points : null,
    });
  });
}
