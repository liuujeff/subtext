@AGENTS.md

# Subtext

A daily word game. Each day everyone gets the same five pairs of unrelated words
("camel" + "ship") and has three guesses per pair to find the word that sits between them
in meaning. Inspired by Chainle and Semantle; the twist is balancing two words at once, shown
on a map. Next.js on Vercel, Postgres (Supabase) with pgvector, and an offline Python
pipeline that builds all the word data. Answers never reach the browser.

## Game rules (what players see)
- **A day**: five pairs (`ROUNDS_PER_DAY`), the same for everyone. Days run midnight to
  midnight, New York time. Day 1 is 2026-10-21.
- **A round**: one pair, up to three guesses, 60 seconds (`ROUND_SECONDS`). The pair stays
  hidden until the player presses Start, which starts the clock; at 0:00 unused guesses are
  lost. Guess the best possible word (rank 1) and the round ends early. Your best guess in
  the pair counts (0 if the clock ran out first).
- **Points**: 0–100 from the guess's rank among 25,000 common words: rank 1 = 100, rank 2 = 96,
  top 10 ≈ 86+, rank 100 = 69, rank 1,000 = 50, rank 5,000 = 33; only the very worst words
  score 0. Max 500 a day.
- **What makes a good guess**: it has to fit *both* words; only the weaker link counts.
  Catch-all words ("thing", "area") get a penalty.
- **Guesses that don't count** (no guess used up, with a message):
  - not in the word list (names and rare words are left out), with "Did you mean …?" for a
    likely misspelling;
  - too close to a clue: the same word, the same first four letters, or containing / contained
    in a clue (4+ letters);
  - a plural or other inflected form ("Try the singular: camel");
  - a repeat.
- **The map** (a sonar scope): the crosshair in the middle is the best word, named only
  after the round ends; the clues are contacts on the rim, left and right. Each guess is a
  blip labelled with its word and points (no separate list): closer to the middle is more
  points, and swinging toward a side means it leans toward that clue. A torpedo rack in the
  top-left corner shows the guesses left; the button is "Fire".
- **After a round**: your score, and the best word named at the crosshair. **After the day**: the total,
  a stalk per pair (labelled with both words, the best guess and its score above, or "no
  guess"), and share text: the total, one emoji per
  pair (🎯 90+, 💥 60+, 🌊 30+, 🫧 below) and the site's link (`location.origin`).
- **Random mode**: unlimited extra pairs from a separate pool, same rules.
- Accounts are optional: without one, progress is tied to the browser by a cookie; "Sign in with
  Google" (in the menu drawer) keeps it across devices and moves the browser's progress into the
  account. "How to play" (menu, top left) opens on a player's first visit.
- **Streaks and stats** (drawer, and the streak on the day summary): a day counts once all five
  daily rounds are finished (3 guesses, a rank-1 hit, or the clock ran out) and were started on
  that puzzle's own New York day, so replaying a past day doesn't extend a streak. The streak
  survives until the end of the day after the last completed one. Stats: current and best
  streak, days completed, average and best day, best words found. Guests get them too.

## How the app works

### The parts
```
scripts/ (Python, offline)  ──upload.py──▶  Postgres (Supabase)
  words, vectors, hub penalties,              words, inflections, puzzles (+ precomputed
  answer pool, pairs, schedule,               score arrays), guesses; score_guess(),
  precomputed scores                          suggest_words()
                                                   ▲  service role only
Browser (React)  ──fetch + cookie──▶  Next.js route handlers (/api/*)
  page, map, guesses                   identify player, enforce rules, score, store
```
The browser only ever learns the clue words and, per guess, points / rank / lean; the top
answers come only after the server confirms the round is over.

### One guess, end to end
1. The page is a static shell; on load it calls `GET /api/today`. The first request gets a
   signed guest cookie. The response has today's rounds and the player's own past guesses
   (progress lives in the database, not localStorage), but each pair only once its round
   has started.
2. The player presses Start: `POST /api/start` stores the start time in `round_starts` (once;
   a reload keeps it) and returns the pair and `msLeft`. The client counts down on its own
   `performance.now()` clock from `msLeft`, so a wrong device clock doesn't matter.
3. The player types a word. The client checks the cheap things first (letters only, too
   close to a clue, repeat) and sends `POST /api/guess`.
4. The server: checks the puzzle is playable (not a future day), the round has started and
   isn't over (3 guesses, a rank-1 hit, or 60 s + `GRACE_SECONDS` = 3 s since the start, for
   guesses fired just in time), the word is valid and not too close; then calls
   `score_guess()` in Postgres, which computes
   the guess's objective from its vector and binary-searches the puzzle's precomputed
   `sorted_scores` for its rank. Unknown word → inflection lookup → spelling suggestion.
5. The guess is stored with `guess_no = previous + 1` *before* the score is returned; a
   unique constraint on `(player, puzzle, guess_no)` with `guess_no ≤ 3` makes the limit
   hold under parallel requests. The response is `{ points, rank, lean, over }`.
6. When the round is over the client calls `GET /api/reveal` to name the best word. After a
   time-out the server unlocks the reveal only once the grace period has passed too (so no
   one reads the answers and then sneaks in a guess); the client waits for it and retries.

### Scoring (identical in Python, Postgres and TypeScript)
- Vectors are unit-normalized, so cosine = inner product.
- `objective(w) = min(cos(w, A), cos(w, B)) - LAM * hub(w)`, `LAM = 1.0`. `hub(w)` is w's
  mean cosine to 3,000 random answer-pool words (penalizes generic words).
- `rank` = 1 + number of eligible pool words with a strictly higher objective (more than
  1e-6 higher: float32 rounding). Eligible = not too close to either clue (rule above).
- `points = round(100 * max(0, 1 - ln(rank) / ln(RANK_CAP)) ^ POINTS_CURVE)`; Python rounds
  with `floor(x + 0.5)` to match JS. `RANK_CAP = 25000` (the whole pool) and `POINTS_CURVE =
  0.6` (was 5000 and 1, which gave rank 100 = 46; made much kinder).
- `lean = cos(w, B) - cos(w, A)`. Map bearing = lean × 2.2, clamped to ±1, × 90° from
  straight up; distance = R × (1 − points/100)^0.75. Text: |lean| < 0.06
  "balanced", > 0.2 "pulled hard toward", else "leans toward".
- Constants live in `scripts/config.py` and `src/lib/game/rules.ts`;
  `tests/fixtures/scoring.json` (from `make_fixtures.py`) keeps them and the formulas in
  step, and `tests/api/scoring-data.test.ts` checks Postgres against Python on real data.

### Word data (`scripts/`, settings in `scripts/config.py`)
- **Model**: `numberbatch-en-19.08` (ConceptNet Numberbatch, English, single words only):
  300 dimensions, built from the ConceptNet knowledge graph with word2vec and GloVe mixed in.
  Picked with `compare_models.py` over fastText crawl-300d-2M (more common answers, but
  weaker on WordSim-353 and SimLex-999 and kinder to catch-all words), fastText wiki-news (the
  previous model), GloVe 300d (newsy answers like "finally") and word2vec Google News
  (misses 17% of the dictionary). Best WordSim-353 (0.815) and the clearest best answers;
  its answers run rarer, with some odd picks (kea). The name thresholds, `WEAK_BEST` and
  `generate_pairs.py`'s `--max-cos` are set for its scale.
- **Guessable words: 57,815.** wordfreq English, lowercase a–z, 3–15 letters, in WordNet or
  NLTK's word list; minus stopwords, a blocklist (LDNOOBW + `scripts/blocklist.txt`),
  contractions spelled without the apostrophe (dont, thats) and names (WordNet entries only
  found capitalized, and outside WordNet, first names or words whose vector sits near a
  first-name centroid). wordfreq stops at Zipf 1.0, which caps the list well below the
  80–100k once hoped for.
- **Inflections: 33,925** plurals / -ed / -ing / irregular forms, dropped when the base is
  present (unless WordNet lists the form as a word: news, glasses, building) and stored in
  `inflections` for "Try the singular".
- **Answer pool: 25,000** most common guessable words that are in WordNet, minus Roman
  numerals, vowel-less abbreviations, `scripts/pool_exclude.txt`, and first names the model
  mostly treats as names (ben, jimmy; rose and lily stay).
- Vectors are stored as float16 (`halfvec(300)`); every score the pipeline computes uses
  those rounded vectors and the stored float32 hub, so Postgres reproduces it exactly.

### Pairs and the schedule
1. `generate_pairs.py` → `scripts/pairs/candidates.csv`: concrete, non-name nouns with low
   similarity to each other, ranked by best objective (columns a, b, top5, best_objective,
   approve, pool).
2. A person reviews: `approve = y`, and `pool = random` for random mode (default daily).
   `prototype.csv` holds the prototype's 56 pairs (42 daily, 14 random), all approved.
3. `build_puzzles.py` appends approved pairs to `scripts/pairs/schedule.csv` (append-only,
   whole days of five, never in the past) and computes each pair's `sorted_scores` and top
   10 answers into `scripts/data/puzzles.npz`.
4. `upload.py puzzles` loads them; `check_schedule.py` exits 1 under 30 days scheduled.

### Database (`supabase/migrations/`)
- `words` (word, freq_rank, in_pool, hub, embedding `halfvec(300)`), `inflections` (form →
  base), `puzzles` (kind daily/random, play_date, round 0–4, word_a, word_b, lam,
  `sorted_scores real[]`, `top_answers jsonb`), `guesses` (player_id, puzzle_id, guess_no
  1–3, word, rank, points, lean), `round_starts` (player_id, puzzle_id, started_at; written
  from the API server's clock and compared with it). A started round counts as played:
  `upload.py` never changes or removes it, and `upload.py vocab --force` clears both.
- `daily_results(player, expire_secs)` → one row per played daily (date, finished rounds, points,
  rank-1 hits), the source of streaks and stats; `merge_guest(guest, user)` moves a guest's
  rounds to an account. Server only, like `score_guess`. PostgREST caps a response at 1,000
  rows, so stats stop seeing days past ~1,000 played.
- `score_guess(puzzle_id, word)` → rank, lean, objective. `suggest_words(word)` → spelling
  candidates (trigram index, ≤ 2 edits, ≤ 1 for short words, sound-alike bonus via Double
  Metaphone, then most common).
- Access: RLS on everywhere with no public policies; `anon` / `authenticated` have no
  privileges on `words`, `inflections`, `puzzles`, `round_starts` or either function, and only SELECT on
  their own `guesses` (signed-in players). Only the server's secret key reads the rest.
- `guesses.player_id` is a guest id or a Supabase user id, so it has no foreign key.
- Size: about 65 MB now (`words` 41 MB, ~100 KB per pair); guesses ~200 B/row, so 1,000
  daily players ≈ 3 MB/day. Supabase free tier: 500 MB.

### Players and identity (`src/lib/api/handler.ts`, `player.ts`)
- **Guests** (everyone for now): a `subtext_player` cookie with a random id signed by
  `PLAYER_COOKIE_SECRET` (HttpOnly, SameSite=Lax, Secure in production, 400 days, refreshed
  on each response). Forged ids get a fresh one. New ids: 100 per IP per hour.
- **Signed-in players** (Google, via Supabase Auth with PKCE): `Authorization: Bearer <Supabase
  token>`; a rejected token is a 401 and the client carries on as a guest. Supabase anonymous
  sign-ins are off. After sign-in `Account.tsx` calls `POST /api/account/link` (token + guest
  cookie), which runs `merge_guest`: the guest's rounds move to the user id, except puzzles the
  account already played (the account's rows win); the guest id is retired (new cookie).
- Rate limits (per server instance, best effort): reads (including `/api/start`) 60/min per
  player and 300/min per IP; guesses 20/min per player and 120/min per IP. The real limit
  is the 3-guess constraint.

### API
All responses are JSON; errors are `{ error, ... }`.
- A round is `{ puzzleId, a, b, guesses, msLeft }`: `a`, `b` and `msLeft` are null until the
  player starts it; `msLeft` goes negative once the clock has run out.
- `GET /api/today` → `{ date, rounds }`; `no_puzzle` (404).
- `POST /api/start` `{ puzzleId }` → `{ a, b, msLeft }`, the only way to get a pair; starting
  again keeps the first start. `not_found`, `bad_request`.
- `POST /api/guess` `{ puzzleId, word }` → `{ points, rank, lean, over }`, or `not_in_list`
  (+ `suggestion`), `too_close_to_clue`, `try_singular` (+ `suggestion`), `already_guessed`,
  `not_started`, `round_over` (also when time is up), `not_found` (missing or future
  puzzle), `conflict`, `bad_request`, `rate_limited`. Past daily puzzles are playable.
- `GET /api/reveal?puzzleId=` → `{ top: [{ word, points }] }`, else `round_not_over` (403).
- `GET /api/stats` → `Stats` (`src/lib/game/stats.ts`), for guests and signed-in players alike.
- `POST /api/account/link` → `{ merged }`; needs a token (`unauthorized` otherwise); a no-op
  without a guest cookie.
- `POST /api/random` `{ exclude? }` → a round, preferring unfinished (not over by guesses or
  time).

### Frontend (`src/components/`)
- One screen, no scrolling, on phones down to 375×553 (iPhone SE with browser bars): a
  `100dvh` column where the map keeps its shape and shrinks when the rest needs room,
  "Next pair" sits beside the score, and a `max-height: 640px` query tightens small screens.
- Map labels (`map-layout.ts`): placed in guess order so earlier ones stay put; each tries
  its usual side (right on the left half), the other side, then a line up or down with a
  leader, avoiding blips, contacts, the torpedo rack, the target and other labels. Labels
  are monospaced, so widths come from letter counts, and have a halo in the panel colour.
  Screen readers get the guesses from the map's `aria-label` and the latest score from a
  hidden status line. Scope coordinates are rounded to 0.01 so server and browser sin/cos
  render the same markup (hydration).
- Sonar console look, light and dark: palettes as CSS variables in `globals.css` (`--glow`
  phosphor green, `--a` cyan, `--b` amber, `--target` red; glows are tokens too, faint in
  light). It follows the device (`prefers-color-scheme`) unless the player picks Light or
  Dark under "Appearance" in the drawer (`ThemePicker.tsx`), saved as `subtext-theme` in
  localStorage; the inline script in `layout.tsx`'s `<head>` (`src/lib/theme.ts`) sets
  `data-theme` on `<html>` before first paint, so the page stays static with no flash.
  New colours go in all three token blocks (light, dark media query, `[data-theme=dark]`).
  JetBrains Mono for headings,
  numbers, the input and map labels + Atkinson Hyperlegible for prose, via `next/font`
  (`--font-mono`, `--font-body`).
- **Firing** (`Game.tsx` → `GuessMap.tsx`): while the server scores a guess the next
  torpedo blinks; once scored, it runs from its tube to the blip, which lands `LANDING`
  (0.55 s, `map-layout.ts`, the `--land` CSS variable on `main.game`) later. Nothing may
  show the spot before then: no blip, bearing lines, ping ring, label, or a round-ending
  reveal panel. A rank-1 hit locks on: the crosshair flashes, rings ripple out, the contacts
  jolt inward. A guess that doesn't count (any rejection) shakes the form. Under
  `prefers-reduced-motion` the sweep, pings, runs, ripples and shake stop and everything
  shows at once; reduced-motion overrides must match the animated selector's specificity.
- **Sound** (`src/lib/sound.ts`, synthesized with Web Audio, no files): a trigger click on
  Fire, a launch thump, then a sonar ping when the blip lands: pitch climbs a pentatonic
  scale with points, panned by bearing, echo delay shrinks the closer it lands. Rank 1 adds
  a thud and rising chord; rejections play a double clunk. One `AudioContext`, made on first
  use after a user gesture, through a limiter; Safari's audio session is set to "ambient"
  (mixes with other audio, follows the silent switch). The speaker button (`SoundToggle.tsx`)
  mutes, saved as `subtext-muted` in localStorage.
- The clock (`Clock` in `GuessMap.tsx`) sits in the scope's top-right corner, mirroring the
  torpedo rack (`CLOCK_BOX` keeps labels off it): 1:00 before the start, red under 10 s,
  hidden once guesses end the round. Before the start a wide Start button takes the guess
  form's place and the pair shows "?"; screen readers hear "30 / 10 seconds left".
- "How to play" is a drawer (`HowToPlay.tsx`, rules text in `HowScoring.tsx`). Random mode
  puts "Back to today" in the header.

## Rules for working on this repo
- **Never leak answers.** Nothing in the browser or any API response may contain vectors,
  `sorted_scores`, `top_answers` (before that player's round is over), future pairs, a
  round's pair before that player starts it, or word lists. Select explicit columns; `npm run check:bundle` and the API leak test enforce it.
- **The server enforces every game rule.** Client-side checks are only for quick feedback.
- **Scoring changes go everywhere at once**: `scripts/` (config + common), `rules.ts`, and
  `score_guess` if the formula changes; then `make_fixtures.py`, rebuild puzzles and run the
  tests. Recompute `sorted_scores` whenever words, vectors, hub or LAM change.
- **Spelling suggestions must not use meaning or the clues** (that would hint at answers).
- **Supabase grants new `public` tables and functions to `anon` / `authenticated`**: every new
  server-only one needs a `revoke`, and a pgTAP check in `supabase/tests/access_test.sql`.
- **Schedule safety**: `schedule.csv` is append-only; never change a past day or a puzzle
  with guesses; random-mode pairs never become dailies.
- **Next 16**: don't export `runtime` from route handlers (Cache Components rejects it), and
  call `unstable_rethrow(error)` first in any `catch` that wraps request access (as
  `withPlayer` does). Read `node_modules/next/dist/docs/` before using new APIs.
- **Secrets**: the Supabase secret key is read only in `src/lib/supabase/admin.ts`; server
  modules import `server-only`; `.env*` (except `.env.example`) and `scripts/data/` stay out
  of git.
- **Layout**: keep the page free of scrolling; check the tallest state (three guesses plus
  the reveal) and the day summary at 375×553 after UI changes.
- **Migrations**: the init migration was edited in place while nothing was deployed. Once a
  database is live, only add new migrations.

## Commands
- `npm run dev` – dev server; needs `.env.local` (see `.env.example`). Google sign-in locally
  also needs OAuth credentials in `supabase/.env` (see `supabase/.env.example`); restart
  `db:start` after adding them. Everything else works without.
- `npm run db:start` / `db:stop` / `db:reset` – local Supabase in Docker. A reset wipes data;
  reload with `scripts/.venv/bin/python scripts/upload.py all`.
- `npm test` – unit; `npm run test:api` – route handlers against the local stack;
  `npm run db:test` – pgTAP.
- `npm run lint`, `npm run typecheck`, `npm run build && npm run check:bundle`,
  `npm run db:types` (after schema changes).
- Python 3.9+: `python3 -m venv scripts/.venv && scripts/.venv/bin/pip install -r
  scripts/requirements.txt`; run scripts as `scripts/.venv/bin/python scripts/<name>.py`.
  Pipeline order: `build_vocab.py` → `generate_pairs.py` (review) → `build_puzzles.py` →
  `upload.py all` → `make_fixtures.py`.

## Layout
- `src/app/` – `page.tsx`, `layout.tsx`, `globals.css`, `api/{today,start,guess,reveal,random,stats,account/link}`.
- `src/components/` – `Game.tsx` (state and flow), `GuessMap.tsx` (sonar, torpedoes, day
  readout), `map-layout.ts` (scope geometry, label placement), `RoundPanels.tsx` (round bars,
  reveal, summary), `HowToPlay.tsx`, `HowScoring.tsx`, `Account.tsx` (sign-in, stats), `ThemePicker.tsx`, `SoundToggle.tsx`.
- `src/lib/game/` – shared: `rules.ts`, `day.ts`, `stats.ts`, `types.ts`, `api-client.ts`.
- `src/lib/theme.ts` – theme storage key and the pre-paint script (shared by the layout and
  `ThemePicker.tsx`).
- `src/lib/sound.ts` – sound effects and the mute setting (browser only).
- `src/lib/api/` – server only: `handler.ts`, `player.ts`, `puzzles.ts`, `rate-limit.ts`.
- `src/lib/supabase/` – `admin.ts`, `auth.ts`, `browser.ts` (for future accounts),
  `database.types.ts` (generated).
- `supabase/` – `config.toml`, `migrations/`, `tests/` (pgTAP).
- `scripts/` – pipeline, `pairs/` (reviewed lists, `schedule.csv`), `data/` (gitignored:
  ~5 GB of embeddings; only the 325 MB Numberbatch file is needed, `compare_models.py`
  reads the rest), `check_bundle.mjs`.
- `tests/` – `unit/`, `api/`, `fixtures/`. `prototype/` – the original single-file game.

## Testing
- Unit: constants and formulas vs the Python fixtures, lean text, New York day boundaries,
  rate limiter, guest cookie signing, sonar positions, map labels not overlapping, ping
  pitch and echo.
- API (`tests/api`, own q-prefixed fixture words and 1999–2000 dates, cleans up): guest
  cookies, signed-in tokens, every guess error and suggestion, 3-guess and rank-1 endings,
  parallel guesses, future/past puzzles, reveal locking per player, random mode, the round
  clock (pairs hidden before the start, one start per round, the grace period, time-out
  endings and reveals, by moving `started_at` back), and a scan of every response for leaks.
- pgTAP (fixtures in 1990): RLS and privileges, `score_guess`, `suggest_words`, constraints.

## Status and known issues
- Runs end to end locally; not deployed (plan: Vercel + Supabase in the same region, e.g.
  `iad1` / `us-east-1`). Production needs `PLAYER_COOKIE_SECRET` and the Supabase keys.
- 8 days of five pairs scheduled (2026-10-21 to 2026-10-28), 14 random pairs, 2 approved
  pairs waiting for a full day. `scripts/pairs/candidates.csv` has 200 unreviewed pairs.
- Weak pairs under Numberbatch: forest + mathematics, horse + ocean, harbor + nightmare. Some
  odd answers (kea for volcano + island, chine, arco, coney, gilbert, langley, goldilocks):
  add them to `pool_exclude.txt` and rebuild.
- Later: an archive of past days, difficulty tiers, a stats screen with history, other sign-in
  providers.
