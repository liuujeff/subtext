import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Players who aren't signed in are identified by a random id in a signed,
// HttpOnly cookie. Their guesses still live in the database (the 3-guess limit
// has to be enforced server-side); the cookie only says whose they are. The
// signature means the server only accepts ids it issued, so new ids go
// through the per-IP limit in withPlayer.

export const PLAYER_COOKIE = "subtext_player";
const MAX_AGE = 400 * 24 * 60 * 60; // Chrome's cap; refreshed on every response
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function secret(): string {
  const value = process.env.PLAYER_COOKIE_SECRET;
  if (!value || value.length < 32) throw new Error("PLAYER_COOKIE_SECRET must be set (32+ characters)");
  return value;
}

function sign(id: string): string {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

function readCookie(header: string | null, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** The guest id from a valid player cookie, or null if it's missing or forged. */
export function readGuestId(request: Request): string | null {
  const value = readCookie(request.headers.get("cookie"), PLAYER_COOKIE);
  const [id, mac] = value?.split(".") ?? [];
  if (!id || !mac || !UUID.test(id)) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(mac);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export function newGuestId(): string {
  return randomUUID();
}

/** Set-Cookie value for a guest id. */
export function guestCookie(id: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${PLAYER_COOKIE}=${id}.${sign(id)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}`;
}
