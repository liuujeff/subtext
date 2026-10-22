import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as betterRoute } from "@/app/api/better/route";
import { POST as guessRoute } from "@/app/api/guess/route";
import { POST as randomRoute } from "@/app/api/random/route";
import { GET as revealRoute } from "@/app/api/reveal/route";
import { POST as startRoute } from "@/app/api/start/route";
import { GET as todayRoute } from "@/app/api/today/route";
import { PLAYER_COOKIE } from "@/lib/api/player";

import { A, admin, B, cleanUp, deletePlayers, SECRET, seed, type Seeded, signedInPlayer, TODAY } from "./helpers";

vi.mock("@/lib/game/day", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/game/day")>()),
  todayInNewYork: () => "2000-01-01",
}));

/** A browser: holds the player cookie the routes set, or a signed-in token. */
type Player = { cookie?: string; token?: string };

type Sent = { status: number; body: Record<string, unknown>; text: string; reveal: boolean; setCookie: string | null };
const sent: Sent[] = [];

async function call(
  route: (req: Request) => Promise<Response>,
  path: string,
  player: Player,
  body?: unknown,
): Promise<Sent> {
  const headers: Record<string, string> = {};
  if (player.cookie) headers.cookie = player.cookie;
  if (player.token) headers.authorization = `Bearer ${player.token}`;
  const init: RequestInit =
    body === undefined
      ? { headers }
      : { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await route(new Request(`http://localhost${path}`, init));
  const text = await res.text();
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) player.cookie = setCookie.split(";")[0];
  const result = { status: res.status, body: JSON.parse(text), text, reveal: path.startsWith("/api/reveal"), setCookie };
  sent.push(result);
  return result;
}

const today = (p: Player) => call(todayRoute, "/api/today", p);
const start = (p: Player, puzzleId: unknown) => call(startRoute, "/api/start", p, { puzzleId });
const guess = (p: Player, puzzleId: unknown, word: unknown) => call(guessRoute, "/api/guess", p, { puzzleId, word });
const reveal = (p: Player, puzzleId: number) => call(revealRoute, `/api/reveal?puzzleId=${puzzleId}`, p);
const better = (p: Player, puzzleId: number) => call(betterRoute, `/api/better?puzzleId=${puzzleId}`, p);
const random = (p: Player) => call(randomRoute, "/api/random", p, {});

/** A guest who has already been given a cookie. */
async function guest(): Promise<Player> {
  const p: Player = {};
  await today(p);
  return p;
}

const guestId = (p: Player) => p.cookie!.split("=")[1].split(".")[0];

/** Moves a guest's start on a round `seconds` into the past. */
async function startedAgo(p: Player, puzzleId: number, seconds: number) {
  const { error } = await admin()
    .from("round_starts")
    .update({ started_at: new Date(Date.now() - seconds * 1000).toISOString() })
    .eq("player_id", guestId(p))
    .eq("puzzle_id", puzzleId);
  if (error) throw error;
}

let ids: Seeded;

beforeAll(async () => {
  ids = await seed();
});

afterAll(async () => {
  await cleanUp();
  await deletePlayers();
});

describe("players", () => {
  it("gives a new visitor a signed, HttpOnly guest cookie", async () => {
    const p: Player = {};
    const res = await today(p);
    expect(res.status).toBe(200);
    expect(res.setCookie).toMatch(new RegExp(`^${PLAYER_COOKIE}=[0-9a-f-]{36}\\.[\\w-]+;`));
    expect(res.setCookie).toContain("HttpOnly");
    expect(res.setCookie).toContain("SameSite=Lax");

    // The same guest on the next request.
    const first = p.cookie;
    await today(p);
    expect(p.cookie).toBe(first);
  });

  it("treats a forged cookie as a new guest", async () => {
    const victim = await guest();
    await start(victim, ids.today[0]);
    await guess(victim, ids.today[0], "qwmid");

    const forger: Player = { cookie: `${PLAYER_COOKIE}=${guestId(victim)}.forged` };
    const res = await today(forger);
    expect(guestId(forger)).not.toBe(guestId(victim));
    expect(res.body).toMatchObject({ rounds: [{ guesses: [] }, {}, {}] });
  });

  it("accepts a signed-in player's token and rejects a bad one", async () => {
    const { id, token } = await signedInPlayer();
    const p: Player = { token };
    await start(p, ids.today[0]);
    expect((await guess(p, ids.today[0], "qwmid")).status).toBe(200);
    const res = await today(p);
    expect(res.setCookie).toBeNull();
    expect(res.body).toMatchObject({ rounds: [{ a: A, guesses: [{ word: "qwmid" }] }, { a: null }, {}] });
    const { data } = await admin().from("guesses").select("player_id").eq("player_id", id);
    expect(data).toHaveLength(1);

    for (const route of [today, random]) expect((await route({ token: "not-a-jwt" })).status).toBe(401);
    expect((await start({ token: "not-a-jwt" }, ids.today[0])).status).toBe(401);
  });
});

describe("GET /api/today", () => {
  it("returns today's rounds, with no pair before the round starts", async () => {
    const res = await today({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: TODAY,
      rounds: ids.today.map((puzzleId) => ({ puzzleId, a: null, b: null, guesses: [], msLeft: null })),
    });
  });

  it("includes the player's own guesses, and nobody else's", async () => {
    const p1 = await guest();
    const p2 = await guest();
    await start(p1, ids.today[1]);
    await guess(p1, ids.today[1], "qwmid");
    const mine = (await today(p1)).body as { rounds: { guesses: unknown[] }[] };
    const theirs = (await today(p2)).body as { rounds: { guesses: unknown[] }[] };
    expect(mine.rounds[1].guesses).toEqual([{ word: "qwmid", rank: 2, points: 92, lean: expect.any(Number) }]);
    expect(theirs.rounds[1].guesses).toEqual([]);
  });
});

describe("POST /api/guess", () => {
  it("scores a guess and returns only points, rank, lean and over", async () => {
    const p = await guest();
    await start(p, ids.today[0]);
    const res = await guess(p, ids.today[0], "  QWMID ");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["lean", "over", "points", "rank"]);
    expect(res.body).toMatchObject({ points: 92, rank: 2, over: false });
    expect(Math.abs(res.body.lean as number)).toBeLessThan(1e-3);

    const low = await guess(p, ids.today[0], "qvlow");
    expect(low.body).toMatchObject({ points: 86, rank: 3, over: false });
    expect(low.body.lean as number).toBeGreaterThan(0.6);
  });

  it("rejects bad words with the right error", async () => {
    const p = await guest();
    const id = ids.today[0];
    await start(p, id);
    expect((await guess(p, id, "qzalphas")).body).toEqual({ error: "too_close_to_clue" });
    expect((await guess(p, id, "two words")).body).toEqual({ error: "not_in_list" });
    expect((await guess(p, id, "qqnotaword")).body).toEqual({ error: "not_in_list" });
    expect((await guess(p, id, "qwmids")).body).toEqual({ error: "try_singular", suggestion: "qwmid" });
    expect((await guess(p, "1", "qwmid")).status).toBe(400);
    expect((await guess(p, id, 7)).status).toBe(400);

    expect((await guess(p, id, "qwmud")).body).toEqual({ error: "not_in_list", suggestion: "qwmid" });

    expect((await guess(p, id, "qwmid")).status).toBe(200);
    expect((await guess(p, id, "qwmid")).body).toEqual({ error: "already_guessed" });
    // No suggesting a word the player already tried.
    const again = await guess(p, id, "qwmud");
    expect(again.body.error).toBe("not_in_list");
    expect(again.body.suggestion).not.toBe("qwmid");

    // None of the rejected words used up a guess.
    expect((await today(p)).body).toMatchObject({ rounds: [{ guesses: [{ word: "qwmid" }] }, {}, {}] });
  });

  it("ends the round after three guesses", async () => {
    const p = await guest();
    const id = ids.today[0];
    await start(p, id);
    expect((await guess(p, id, "qwmid")).body.over).toBe(false);
    expect((await guess(p, id, "qvlow")).body.over).toBe(false);
    expect((await guess(p, id, "qtzero")).body).toMatchObject({ rank: 5, points: 80, over: true });
    expect((await guess(p, id, "qsone")).body).toEqual({ error: "round_over" });
  });

  it("ends the round on a rank-1 guess", async () => {
    const p = await guest();
    await start(p, ids.today[2]);
    expect((await guess(p, ids.today[2], "qupeak")).body).toMatchObject({ rank: 1, points: 100, over: true });
    expect((await guess(p, ids.today[2], "qwmid")).body).toEqual({ error: "round_over" });
  });

  it("never scores more than three guesses, even in parallel", async () => {
    const p = await guest();
    const words = ["qwmid", "qvlow", "qtzero", "qsone", "qrtwo", "qpthree", "qnfour"];
    await start(p, ids.today[1]);
    const results = await Promise.all(words.map((w) => guess({ ...p }, ids.today[1], w)));
    const scored = results.filter((r) => r.status === 200);
    expect(scored.length).toBeGreaterThan(0);
    expect(scored.length).toBeLessThanOrEqual(3);
    for (const r of results.filter((r) => r.status !== 200)) expect(r.status).toBe(409);

    const { count } = await admin()
      .from("guesses")
      .select("*", { count: "exact", head: true })
      .eq("player_id", guestId(p))
      .eq("puzzle_id", ids.today[1]);
    expect(count).toBe(scored.length);
  });

  it("hides future puzzles and allows past ones", async () => {
    const p = await guest();
    expect((await start(p, ids.future)).body).toEqual({ error: "not_found" });
    expect((await guess(p, ids.future, "qwmid")).body).toEqual({ error: "not_found" });
    expect((await guess(p, 2 ** 40, "qwmid")).body).toEqual({ error: "not_found" });
    await start(p, ids.past);
    expect((await guess(p, ids.past, "qwmid")).status).toBe(200);
  });
});

describe("GET /api/reveal", () => {
  it("stays locked until the player's round is over", async () => {
    const p = await guest();
    const id = ids.today[0];
    expect((await reveal(p, id)).body).toEqual({ error: "round_not_over" });
    await start(p, id);
    expect((await reveal(p, id)).body).toEqual({ error: "round_not_over" });
    await guess(p, id, "qwmid");
    await guess(p, id, "qvlow");
    expect((await reveal(p, id)).body).toEqual({ error: "round_not_over" });
    await guess(p, id, "qtzero");
    expect((await reveal(p, id)).body).toEqual({
      top: [{ word: SECRET, points: 100 }, { word: "qwmid", points: 92 }],
    });

    // Another player's finished round doesn't unlock it for this one.
    expect((await reveal(await guest(), id)).status).toBe(403);
  });

  it("hides future puzzles", async () => {
    expect((await reveal(await guest(), ids.future)).body).toEqual({ error: "not_found" });
  });
});

describe("POST /api/random", () => {
  it("returns a random-mode pair, never a daily one", async () => {
    const res = await random(await guest());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["a", "b", "guesses", "msLeft", "puzzleId"]);
    const { data } = await admin().from("puzzles").select("kind").eq("id", res.body.puzzleId as number).single();
    expect(data?.kind).toBe("random");
  });

  it("hides the pair until the round starts, like a daily round", async () => {
    const p = await guest();
    const res = await random(p);
    expect(res.body).toMatchObject({ a: null, b: null, msLeft: null });
    // The pick may be a real random-mode pair, not the fixture.
    const id = res.body.puzzleId as number;
    const { data } = await admin().from("puzzles").select("word_a, word_b").eq("id", id).single();
    expect((await start(p, id)).body).toMatchObject({ a: data?.word_a, b: data?.word_b });
    await admin().from("round_starts").delete().eq("player_id", guestId(p));
  });
});

describe("the round clock", () => {
  it("starts on POST /api/start, which returns the pair, and only once", async () => {
    const p = await guest();
    const id = ids.today[0];
    const first = await start(p, id);
    expect(first.status).toBe(200);
    expect(Object.keys(first.body).sort()).toEqual(["a", "b", "msLeft"]);
    expect(first.body).toMatchObject({ a: A, b: B });
    expect(first.body.msLeft).toBeGreaterThan(55_000);
    expect(first.body.msLeft).toBeLessThanOrEqual(60_000);

    const rounds = ((await today(p)).body as { rounds: Record<string, unknown>[] }).rounds;
    expect(rounds[0]).toMatchObject({ a: A, b: B, msLeft: expect.any(Number) });
    expect(rounds[1]).toMatchObject({ a: null, b: null, msLeft: null });

    // Starting again (a reload) keeps the clock running from the first start.
    await startedAgo(p, id, 20);
    expect((await start(p, id)).body.msLeft).toBeLessThanOrEqual(40_000);
    const { count } = await admin()
      .from("round_starts")
      .select("*", { count: "exact", head: true })
      .eq("player_id", guestId(p))
      .eq("puzzle_id", id);
    expect(count).toBe(1);

    expect((await start(p, "1")).status).toBe(400);
    expect((await start(p, 2 ** 40)).body).toEqual({ error: "not_found" });
  });

  it("refuses guesses on a round that hasn't started", async () => {
    const p = await guest();
    expect((await guess(p, ids.today[1], "qwmid")).body).toEqual({ error: "not_started" });
    const { count } = await admin()
      .from("guesses")
      .select("*", { count: "exact", head: true })
      .eq("player_id", guestId(p));
    expect(count).toBe(0);
  });

  it("takes guesses until the clock and its grace period run out", async () => {
    const p = await guest();
    const id = ids.today[1];
    await start(p, id);
    await startedAgo(p, id, 61); // out of time, but still in the grace period
    expect((await guess(p, id, "qwmid")).status).toBe(200);
    await startedAgo(p, id, 64);
    expect((await guess(p, id, "qvlow")).body).toEqual({ error: "round_over" });
    const rounds = ((await today(p)).body as { rounds: { msLeft: number }[] }).rounds;
    expect(rounds[1].msLeft).toBeLessThan(-3_000);
  });

  it("unlocks the reveal once time is up, after the grace period", async () => {
    const p = await guest();
    const id = ids.today[2];
    await start(p, id);
    await startedAgo(p, id, 61);
    expect((await reveal(p, id)).body).toEqual({ error: "round_not_over" });
    await startedAgo(p, id, 64);
    expect((await reveal(p, id)).body).toEqual({
      top: [{ word: SECRET, points: 100 }, { word: "qwmid", points: 92 }],
    });
  });
});

describe("GET /api/better", () => {
  it("stays locked until the round is over, then names a word only after a weak round", async () => {
    const p = await guest();
    const id = ids.today[1];
    await start(p, id);
    expect((await better(p, id)).body).toEqual({ error: "round_not_over" });
    await startedAgo(p, id, 61);
    expect((await better(p, id)).body).toEqual({ error: "round_not_over" }); // grace period
    await startedAgo(p, id, 64);
    // Nothing scored before the clock ran out: the weakest of the top answers,
    // never the best word, with its points scored now.
    expect((await better(p, id)).body).toEqual({ better: { word: "qwmid", points: 92 } });
  });

  it("names nothing after a round that scored more than 66", async () => {
    const p = await guest();
    const id = ids.today[2];
    await start(p, id);
    for (const w of ["qwmid", "qvlow", "qtzero"]) await guess(p, id, w);
    expect((await better(p, id)).body).toEqual({ better: null });
  });
});

describe("responses", () => {
  it("never carry vectors, score arrays or answers before the reveal", () => {
    expect(sent.length).toBeGreaterThan(40);
    for (const r of sent) {
      for (const leak of ["sorted_scores", "embedding", "hub", "objective", "top_answers", "lam"]) {
        expect(r.text).not.toContain(leak);
      }
      if (!(r.reveal && r.status === 200)) expect(r.text).not.toContain(SECRET);
    }
  });
});
