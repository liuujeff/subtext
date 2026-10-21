import "server-only";

import { unstable_rethrow } from "next/navigation";

import type { ApiErrorCode } from "@/lib/game/types";
import { getUserId } from "@/lib/supabase/auth";

import { guestCookie, newGuestId, readGuestId } from "./player";
import { isRateLimited, type Limit } from "./rate-limit";

const NO_STORE = { "cache-control": "no-store" };

const LIMITS = {
  read: { player: { limit: 60, windowMs: 60_000 }, ip: { limit: 300, windowMs: 60_000 } },
  guess: { player: { limit: 20, windowMs: 60_000 }, ip: { limit: 120, windowMs: 60_000 } },
} satisfies Record<string, { player: Limit; ip: Limit }>;

// New guest ids per IP, like Supabase Auth's cap on anonymous sign-ins. Kept
// loose because schools and offices share an IP.
const NEW_GUESTS: Limit = { limit: 100, windowMs: 60 * 60_000 };

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function apiError(error: ApiErrorCode, status: number, extra?: Record<string, unknown>): Response {
  return json({ error, ...extra }, status);
}

/**
 * Runs a route for a player: a signed-in user (`Authorization: Bearer`) or a
 * guest (player cookie, issued here on the first request). Applies the rate
 * limits and turns unexpected errors into a 500 without details.
 */
export async function withPlayer(
  request: Request,
  kind: keyof typeof LIMITS,
  run: (playerId: string) => Promise<Response>,
): Promise<Response> {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    let playerId: string | null;
    let cookie: string | undefined;

    if (request.headers.has("authorization")) {
      playerId = await getUserId(request);
      if (!playerId) return apiError("unauthorized", 401);
    } else {
      playerId = readGuestId(request);
      if (!playerId) {
        if (isRateLimited(`new-guest:ip:${ip}`, NEW_GUESTS)) return apiError("rate_limited", 429);
        playerId = newGuestId();
      }
      cookie = guestCookie(playerId);
    }

    const limits = LIMITS[kind];
    if (isRateLimited(`${kind}:player:${playerId}`, limits.player) || isRateLimited(`${kind}:ip:${ip}`, limits.ip)) {
      return apiError("rate_limited", 429);
    }
    const response = await run(playerId);
    if (cookie) response.headers.append("set-cookie", cookie);
    return response;
  } catch (error) {
    // Next signals "this route is dynamic" by throwing; let those through.
    unstable_rethrow(error);
    console.error(error);
    return apiError("server_error", 500);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
