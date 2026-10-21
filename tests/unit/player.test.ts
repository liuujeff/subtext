import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { guestCookie, newGuestId, PLAYER_COOKIE, readGuestId } from "@/lib/api/player";

const withCookie = (cookie: string) => new Request("http://localhost/", { headers: { cookie } });

describe("guest player cookie", () => {
  beforeEach(() => vi.stubEnv("PLAYER_COOKIE_SECRET", "test-secret-that-is-at-least-32-chars"));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips an id it signed, among other cookies", () => {
    const id = newGuestId();
    const value = guestCookie(id).split(";")[0];
    expect(readGuestId(withCookie(`theme=dark; ${value}; other=1`))).toBe(id);
  });

  it("rejects missing, malformed, tampered and differently-signed cookies", () => {
    const id = newGuestId();
    const [, signed] = guestCookie(id).split(";")[0].split("=");
    const mac = signed.split(".")[1];
    expect(readGuestId(new Request("http://localhost/"))).toBeNull();
    expect(readGuestId(withCookie(`${PLAYER_COOKIE}=${id}`))).toBeNull();
    expect(readGuestId(withCookie(`${PLAYER_COOKIE}=${newGuestId()}.${mac}`))).toBeNull();
    expect(readGuestId(withCookie(`${PLAYER_COOKIE}=not-a-uuid.${mac}`))).toBeNull();

    vi.stubEnv("PLAYER_COOKIE_SECRET", "another-secret-that-is-at-least-32-chars");
    expect(readGuestId(withCookie(`${PLAYER_COOKIE}=${signed}`))).toBeNull();
  });

  it("sets HttpOnly and SameSite always, and Secure in production", () => {
    expect(guestCookie(newGuestId())).toMatch(/; HttpOnly; SameSite=Lax$/);
    vi.stubEnv("NODE_ENV", "production");
    expect(guestCookie(newGuestId())).toMatch(/; Secure$/);
  });

  it("refuses to run without a strong secret", () => {
    vi.stubEnv("PLAYER_COOKIE_SECRET", "short");
    expect(() => guestCookie(newGuestId())).toThrow(/PLAYER_COOKIE_SECRET/);
  });
});
