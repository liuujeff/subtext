# Subtext

A daily word game: find the word that sits between two others in meaning. Next.js on
Vercel, Supabase (Postgres + pgvector) for words, puzzles and guesses, and an offline
Python pipeline that builds the data. See `CLAUDE.md` for the design, scoring rules and
schema notes.

## Local setup

Needs Node 20+, Docker and Python 3.9+.

```bash
npm install
npm run db:start            # local Supabase; prints API_URL, PUBLISHABLE_KEY, SECRET_KEY
cp .env.example .env.local  # fill in the values from db:start, and
                            # PLAYER_COOKIE_SECRET=$(openssl rand -base64 32)

# Build and load the data (first run downloads ~330 MB of embeddings)
python3 -m venv scripts/.venv
scripts/.venv/bin/pip install -r scripts/requirements.txt
scripts/.venv/bin/python scripts/build_vocab.py
scripts/.venv/bin/python scripts/build_puzzles.py
scripts/.venv/bin/python scripts/upload.py all

npm run dev                 # http://localhost:3000
```

After `npm run db:reset`, run `upload.py all` again.

## Adding pairs

```bash
scripts/.venv/bin/python scripts/generate_pairs.py       # writes scripts/pairs/candidates.csv
# mark approve=y (and pool=random for random mode) on the pairs you like
scripts/.venv/bin/python scripts/build_puzzles.py
scripts/.venv/bin/python scripts/upload.py puzzles
scripts/.venv/bin/python scripts/check_schedule.py       # warns under 30 days
```

`scripts/eval_pairs.py "a b; c d"` prints the top answers for any pair, and
`scripts/compare_models.py` compares the candidate embedding models (downloads ~5 GB).

## Checks

```bash
npm test                                # unit
npm run test:api                        # route handlers against the local stack
npm run db:test                         # pgTAP: access control, score_guess, constraints
npm run lint && npm run typecheck
npm run build && npm run check:bundle   # no keys, scores or word lists in the client bundle
```

After changing the schema, add a migration (`npx supabase migration new <name>`), then run
`npm run db:reset` and `npm run db:types`.
