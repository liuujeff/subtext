import "server-only";

import { getSupabaseAdmin } from "./admin";

/**
 * Verifies the access token the browser sends as `Authorization: Bearer <jwt>`
 * and returns the player's user id, or null if it's missing or invalid.
 */
export async function getUserId(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;

  const { data, error } = await getSupabaseAdmin().auth.getClaims(token);
  if (error || !data) return null;
  return data.claims.sub ?? null;
}
