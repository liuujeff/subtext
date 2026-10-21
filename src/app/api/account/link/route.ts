import { apiError, json, withPlayer } from "@/lib/api/handler";
import { guestCookie, newGuestId, readGuestId } from "@/lib/api/player";
import type { LinkResponse } from "@/lib/game/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Called after sign-in: moves the browser's guest rounds to the account, so
 * progress and streaks carry over. Needs both the token (who is signing in)
 * and the guest cookie (whose rounds they are). The guest id is retired
 * afterwards, so it can't be merged into a second account.
 */
export async function POST(request: Request) {
  return withPlayer(request, "read", async (userId) => {
    if (!request.headers.has("authorization")) return apiError("unauthorized", 401);
    const guestId = readGuestId(request);
    if (!guestId) return json<LinkResponse>({ merged: false });

    const { data, error } = await getSupabaseAdmin().rpc("merge_guest", { p_guest: guestId, p_user: userId });
    if (error) throw error;

    const response = json<LinkResponse>({ merged: data > 0 });
    if (data > 0) response.headers.append("set-cookie", guestCookie(newGuestId()));
    return response;
  });
}
