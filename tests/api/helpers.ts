import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

// Fixture words: made-up, with distinct first four letters so none is "too
// close" to the clues, and far outside the real vocabulary's ids.
export const TODAY = "2000-01-01";
export const FUTURE = "2000-01-02";
export const PAST = "1999-12-31";
export const A = "qzalpha";
export const B = "qxbravo";
export const SECRET = "qksecret"; // only ever in top_answers
const FIRST_ID = 9_000_001;

export function admin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A 300-dim unit vector from its first few components, as pgvector text. */
function vec(...head: number[]) {
  const norm = Math.hypot(...head);
  const v = new Array(300).fill(0);
  head.forEach((x, i) => (v[i] = x / norm));
  return JSON.stringify(v);
}

// Against sorted_scores [0.9, 0.5, 0.3, 0.1]: objective = min(cos A, cos B) - hub.
export const WORDS = {
  [A]: { v: vec(1, 0), hub: 0 },
  [B]: { v: vec(0, 1), hub: 0 },
  qwmid: { v: vec(1, 1), hub: 0 }, // 0.707 -> rank 2
  qvlow: { v: vec(1, 3), hub: 0 }, // 0.316 -> rank 3, leans to B
  qtzero: { v: vec(0, 0, 1), hub: 0 }, // 0 -> rank 5
  qupeak: { v: vec(1, 1), hub: -0.5 }, // 1.207 -> rank 1
  qsone: { v: vec(1, 2), hub: 0 },
  qrtwo: { v: vec(2, 1), hub: 0 },
  qpthree: { v: vec(1, 4), hub: 0 },
  qnfour: { v: vec(4, 1), hub: 0 },
};

export type Seeded = { today: number[]; future: number; past: number; random: number };

export async function cleanUp() {
  const db = admin();
  const { data } = await db.from("puzzles").select("id").or(`word_a.eq.${A},word_b.eq.${B}`);
  const ids = (data ?? []).map((p) => p.id);
  if (ids.length) {
    await db.from("guesses").delete().in("puzzle_id", ids);
    await db.from("round_starts").delete().in("puzzle_id", ids);
    await db.from("puzzles").delete().in("id", ids);
  }
  await db.from("inflections").delete().like("form", "q%").in("base", Object.keys(WORDS));
  await db.from("words").delete().gte("id", FIRST_ID);
}

export async function seed(): Promise<Seeded> {
  await cleanUp();
  const db = admin();
  const words = Object.entries(WORDS).map(([word, w], i) => ({
    id: FIRST_ID + i,
    word,
    freq_rank: FIRST_ID + i,
    in_pool: true,
    hub: w.hub,
    embedding: w.v,
  }));
  must(await db.from("words").insert(words));
  must(await db.from("inflections").insert({ form: "qwmids", base: "qwmid" }));

  const common = {
    word_a: A,
    word_b: B,
    lam: 1,
    sorted_scores: [0.9, 0.5, 0.3, 0.1],
    top_answers: [{ word: SECRET, points: 100 }, { word: "qwmid", points: 92 }],
  };
  const rows = [
    ...[0, 1, 2].map((round) => ({ ...common, kind: "daily", play_date: TODAY, round })),
    { ...common, kind: "daily", play_date: FUTURE, round: 0 },
    { ...common, kind: "daily", play_date: PAST, round: 0 },
    { ...common, kind: "random", play_date: null, round: null },
  ];
  const { data, error } = await db.from("puzzles").insert(rows).select("id");
  if (error) throw error;
  const ids = data.map((p) => p.id);
  return { today: ids.slice(0, 3), future: ids[3], past: ids[4], random: ids[5] };
}

function must<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

const createdUsers: string[] = [];

/** A fresh signed-in player (an email account; guests are made by the routes themselves). */
export async function signedInPlayer(): Promise<{ id: string; token: string }> {
  const email = `test-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);

  const browser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await browser.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, token: signIn.data.session.access_token };
}

export async function deletePlayers() {
  const db = admin();
  await Promise.all(createdUsers.splice(0).map((id) => db.auth.admin.deleteUser(id)));
}
