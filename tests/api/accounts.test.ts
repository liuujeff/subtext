import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as linkRoute } from "@/app/api/account/link/route";
import { POST as guessRoute } from "@/app/api/guess/route";
import { POST as startRoute } from "@/app/api/start/route";
import { GET as distributionRoute } from "@/app/api/distribution/route";
import { GET as statsRoute } from "@/app/api/stats/route";
import { readGuestId } from "@/lib/api/player";

import { admin, cleanUp, deletePlayers, seed, signedInPlayer, A, B, type Seeded } from "./helpers";

vi.mock("@/lib/game/day", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/game/day")>()),
  todayInNewYork: () => "2000-01-01",
}));

type Player = { cookie?: string; token?: string };

async function call(route: (req: Request) => Promise<Response>, path: string, p: Player, body?: unknown) {
  const headers: Record<string, string> = {};
  if (p.cookie) headers.cookie = p.cookie;
  if (p.token) headers.authorization = `Bearer ${p.token}`;
  const init: RequestInit =
    body === undefined
      ? { headers }
      : { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await route(new Request(`http://localhost${path}`, init));
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) p.cookie = setCookie.split(";")[0];
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, setCookie };
}

const stats = (p: Player) => call(statsRoute, "/api/stats", p);
const distribution = (p: Player) => call(distributionRoute, "/api/distribution", p);
const link = (p: Player) => call(linkRoute, "/api/account/link", p, {});

let ids: Seeded;
// Five rounds on each of these days.
const TODAY = "2000-01-01";
const DAYS = ["1999-12-27", "1999-12-28", "1999-12-29", "1999-12-30", "1999-12-31"];
const dayIds: Record<string, number[]> = {};

beforeAll(async () => {
  ids = await seed();
  // seed() already has round 0 of 1999-12-31 (its past puzzle).
  const rows = DAYS.flatMap((play_date) =>
    [0, 1, 2, 3, 4]
      .filter((round) => !(play_date === "1999-12-31" && round === 0))
      .map((round) => ({
        kind: "daily",
        play_date,
        round,
        word_a: A,
        word_b: B,
        lam: 1,
        sorted_scores: [0.9, 0.5],
        top_answers: [],
      })),
  );
  const { data, error } = await admin().from("puzzles").insert(rows).select("id, play_date, round").order("id");
  if (error) throw error;
  // seed() makes three rounds for today; a full day has five.
  const more = await admin()
    .from("puzzles")
    .insert([3, 4].map((round) => ({ ...rows[0], play_date: TODAY, round })))
    .select("id")
    .order("id");
  if (more.error) throw more.error;
  dayIds[TODAY] = [...ids.today, ...more.data.map((p) => p.id)];
  for (const d of DAYS) {
    const mine = data.filter((p) => p.play_date === d).map((p) => p.id);
    dayIds[d] = d === "1999-12-31" ? [ids.past, ...mine] : mine;
  }
});

afterAll(async () => {
  await cleanUp();
  await deletePlayers();
});

/** The player started every listed round at noon New York time on `day`, and finished it with 3 guesses worth `points`. */
async function play(playerId: string, day: string, rounds: number[], points: number, startedAt = `${day}T17:00:00Z`) {
  const db = admin();
  const puzzleIds = rounds.map((r) => dayIds[day][r]);
  await db.from("round_starts").insert(puzzleIds.map((puzzle_id) => ({ player_id: playerId, puzzle_id, started_at: startedAt })));
  await db.from("guesses").insert(
    puzzleIds.flatMap((puzzle_id) =>
      ["qwmid", "qvlow", "qtzero"].map((word, i) => ({
        player_id: playerId,
        puzzle_id,
        guess_no: i + 1,
        word,
        rank: 50,
        points: i === 0 ? points : 1,
        lean: 0,
      })),
    ),
  );
}

describe("GET /api/stats", () => {
  it("counts completed days into streaks and averages", async () => {
    const p = await signedInPlayer();
    await play(p.id, "1999-12-29", [0, 1, 2, 3, 4], 40);
    await play(p.id, "1999-12-30", [0, 1, 2, 3, 4], 60);
    await play(p.id, "1999-12-31", [0, 1, 2, 3, 4], 80);
    const res = await stats({ token: p.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      daysCompleted: 3,
      currentStreak: 3,
      bestStreak: 3,
      averageScore: 300,
      bestScore: 400,
      roundsPlayed: 15,
    });
  });

  it("needs all five rounds, and a start on the puzzle's own day", async () => {
    const p = await signedInPlayer();
    await play(p.id, "1999-12-27", [0, 1, 2, 3], 50); // four of five
    await play(p.id, "1999-12-28", [0, 1, 2, 3, 4], 50, "2000-01-01T17:00:00Z"); // replayed later
    const res = await stats({ token: p.token });
    expect(res.body).toMatchObject({ daysCompleted: 0, currentStreak: 0, averageScore: null });
  });

  it("counts a timed-out round as finished, and an open one not", async () => {
    const p = await signedInPlayer();
    const day = "1999-12-30";
    const old = `${day}T17:00:00Z`; // long past its 60 s clock
    await admin()
      .from("round_starts")
      .insert(dayIds[day].map((puzzle_id) => ({ player_id: p.id, puzzle_id, started_at: old })));
    expect((await stats({ token: p.token })).body).toMatchObject({ daysCompleted: 1, roundsPlayed: 5 });
  });

  it("works for guests too, tied to their cookie", async () => {
    const p: Player = {};
    expect((await stats(p)).body).toMatchObject({ daysCompleted: 0, currentStreak: 0 });
    expect(p.cookie).toBeDefined();
  });
});

describe("POST /api/account/link", () => {
  it("moves a guest's rounds to the account and retires the guest id", async () => {
    const guest: Player = {};
    const puzzleId = ids.today[0];
    expect((await call(startRoute, "/api/start", guest, { puzzleId })).status).toBe(200);
    expect((await call(guessRoute, "/api/guess", guest, { puzzleId, word: "qwmid" })).status).toBe(200);
    const guestId = readGuestId(new Request("http://localhost", { headers: { cookie: guest.cookie! } }))!;

    const user = await signedInPlayer();
    const res = await link({ cookie: guest.cookie, token: user.token });
    // The route retires the guest id: a new cookie comes back.
    expect(res.body).toEqual({ merged: true });
    expect(res.setCookie).toContain("subtext_player=");

    const db = admin();
    const { data: mine } = await db.from("guesses").select("word").eq("player_id", user.id).eq("puzzle_id", puzzleId);
    expect(mine).toEqual([{ word: "qwmid" }]);
    const { data: starts } = await db.from("round_starts").select("player_id").eq("puzzle_id", puzzleId);
    expect(starts).toEqual([{ player_id: user.id }]);
    const { data: left } = await db.from("guesses").select("id").eq("player_id", guestId);
    expect(left).toEqual([]);
  });

  it("keeps the account's rounds when both played the same puzzle", async () => {
    const puzzleId = ids.today[1];
    const user = await signedInPlayer();
    await call(startRoute, "/api/start", { token: user.token }, { puzzleId });
    await call(guessRoute, "/api/guess", { token: user.token }, { puzzleId, word: "qwmid" });

    const guest: Player = {};
    await call(startRoute, "/api/start", guest, { puzzleId });
    await call(guessRoute, "/api/guess", guest, { puzzleId, word: "qvlow" });
    expect((await link({ cookie: guest.cookie, token: user.token })).body).toEqual({ merged: true });

    const { data } = await admin().from("guesses").select("word").eq("player_id", user.id).eq("puzzle_id", puzzleId);
    expect(data).toEqual([{ word: "qwmid" }]);
  });

  it("does nothing without a guest cookie, and needs a token", async () => {
    const user = await signedInPlayer();
    const res = await link({ token: user.token });
    expect(res.body).toEqual({ merged: false });
    expect(res.setCookie).toBeNull();
    expect((await link({})).status).toBe(401);
    expect((await link({ token: "not-a-jwt" })).status).toBe(401);
  });

  it("can't be merged a second time", async () => {
    const guest: Player = {};
    await call(startRoute, "/api/start", guest, { puzzleId: ids.today[2] });
    const first = await signedInPlayer();
    const old = guest.cookie;
    expect((await link({ cookie: guest.cookie, token: first.token })).body).toEqual({ merged: true });
    const second = await signedInPlayer();
    expect((await link({ cookie: old, token: second.token })).body).toEqual({ merged: false });
  });
});

describe("GET /api/distribution", () => {
  it("summarizes finished days and places the player among them", async () => {
    const strong = await signedInPlayer();
    const middle = await signedInPlayer();
    const weak = await signedInPlayer();
    const open = await signedInPlayer();
    await play(strong.id, TODAY, [0, 1, 2, 3, 4], 80); // 400
    await play(middle.id, TODAY, [0, 1, 2, 3, 4], 60); // 300
    await play(weak.id, TODAY, [0, 1, 2, 3, 4], 40); // 200
    await play(open.id, TODAY, [0, 1], 90); // two rounds only: not counted

    const res = await distribution({ token: strong.token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: TODAY, players: 3, mean: 300, sd: 81.6, total: 400, below: 2 });
    expect((await distribution({ token: middle.token })).body).toMatchObject({ total: 300, below: 1 });
    expect((await distribution({ token: weak.token })).body).toMatchObject({ total: 200, below: 0 });

    // Someone who hasn't finished sees the spread but no place in it.
    expect((await distribution({ token: open.token })).body).toMatchObject({ players: 3, total: null, below: null });
    expect((await distribution({})).body).toMatchObject({ players: 3, total: null, below: null });
  });
});
