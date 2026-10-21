import { describe, expect, it } from "vitest";

import { pointsForRank } from "@/lib/game/rules";

import fixtures from "../fixtures/scoring.json";
import { admin } from "./helpers";

// Python (scripts/make_fixtures.py) and score_guess() in Postgres must agree on
// real data. Needs the pipeline's puzzles in the local database (upload.py).
describe("score_guess on uploaded data matches the Python pipeline", async () => {
  const db = admin();
  const pairs = [...new Map(fixtures.guesses.map((g) => [`${g.a} ${g.b}`, g])).values()];
  const puzzleIds = new Map<string, number>();
  for (const { a, b } of pairs) {
    const { data } = await db.from("puzzles").select("id").eq("word_a", a).eq("word_b", b).limit(1).maybeSingle();
    if (data) puzzleIds.set(`${a} ${b}`, data.id);
  }

  it.skipIf(puzzleIds.size < pairs.length)("for every fixture guess", async () => {
    for (const g of fixtures.guesses) {
      const { data, error } = await db
        .rpc("score_guess", { p_puzzle_id: puzzleIds.get(`${g.a} ${g.b}`)!, p_word: g.word })
        .single();
      expect(error).toBeNull();
      expect({ word: g.word, rank: data!.rank }).toEqual({ word: g.word, rank: g.rank });
      expect(pointsForRank(data!.rank)).toBe(g.points);
      expect(data!.lean).toBeCloseTo(g.lean, 5);
    }
  });
});
