-- Subtext schema.
--
-- Nothing in words, inflections or puzzles may ever reach a browser. RLS is on
-- for every table with no public policies, and anon/authenticated also lose
-- their table privileges, so a policy added by mistake still can't expose them.
-- Only the server (service role) reads these tables. Signed-in players may
-- read their own guesses.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

-- Every guessable word. Embeddings are unit-normalized, so cosine similarity is
-- the inner product. halfvec(300) keeps a row around 0.6 KB (vector(300) would
-- be ~1.2 KB). The pipeline must compute sorted_scores from these same
-- float16-rounded vectors, or ranks drift by one at the boundaries.
create table public.words (
  id         int primary key,
  word       text unique not null check (word ~ '^[a-z]{3,15}$'),
  freq_rank  int not null,
  in_pool    boolean not null,  -- part of the answer pool
  hub        real not null,     -- mean cosine to a sample of the answer pool
  embedding  extensions.halfvec(300) not null
);

-- Inflections dropped from words because their base form is present
-- ("camels" -> "camel"), so a guess can get "Try the singular: camel".
create table public.inflections (
  form  text primary key check (form ~ '^[a-z]+$'),
  base  text not null references public.words (word)
);

-- ---------------------------------------------------------------------------
-- Puzzles
-- ---------------------------------------------------------------------------

create table public.puzzles (
  id             bigint generated always as identity primary key,
  kind           text not null check (kind in ('daily', 'random')),
  play_date      date,      -- daily only; null for random-mode pairs
  round          smallint,  -- 0..4 for daily
  word_a         text not null references public.words (word),
  word_b         text not null references public.words (word),
  lam            real not null,     -- hub penalty the scores were built with
  sorted_scores  real[] not null,   -- objective of every eligible pool word, descending
  top_answers    jsonb not null,    -- [{word, points}] top 10, for the reveal
  unique (play_date, round),
  check (word_a <> word_b),
  check (cardinality(sorted_scores) > 0),
  check (
    (kind = 'daily' and play_date is not null and round between 0 and 4)
    or (kind = 'random' and play_date is null and round is null)
  )
);

-- ---------------------------------------------------------------------------
-- Guesses
-- ---------------------------------------------------------------------------

-- guess_no makes the 3-guess limit hold under concurrent requests: the route
-- inserts guess_no = (existing guesses + 1), and a parallel duplicate fails on
-- the unique constraint instead of slipping in a 4th scored guess. The route
-- must insert before it returns the score.
--
-- player_id is the Supabase user id for signed-in players, or the id in a
-- guest's signed cookie (src/lib/api/player.ts). Guests have no auth.users
-- row, so there's no foreign key.
create table public.guesses (
  id          bigint generated always as identity primary key,
  player_id   uuid not null,
  puzzle_id   bigint not null references public.puzzles (id),
  guess_no    smallint not null check (guess_no between 1 and 3),
  word        text not null,
  rank        int not null check (rank >= 1),
  points      smallint not null check (points between 0 and 100),
  lean        real not null,
  created_at  timestamptz not null default now(),
  unique (player_id, puzzle_id, word),
  unique (player_id, puzzle_id, guess_no)
);

create index guesses_puzzle_id_idx on public.guesses (puzzle_id);

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table public.words       enable row level security;
alter table public.inflections enable row level security;
alter table public.puzzles     enable row level security;
alter table public.guesses     enable row level security;

revoke all on public.words, public.inflections, public.puzzles, public.guesses
  from anon, authenticated;

grant select on public.guesses to authenticated;

create policy "Players read their own guesses"
  on public.guesses for select to authenticated
  using ((select auth.uid()) = player_id);

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------

-- Scores one guess against one puzzle in a single round trip:
--   objective = min(cos(w, A), cos(w, B)) - lam * hub(w)
--   rank      = 1 + number of sorted_scores strictly above the objective
--   lean      = cos(w, B) - cos(w, A)
-- Returns no row if the puzzle or the word doesn't exist. Game rules (too close
-- to a clue, guess limit, round over) are enforced by the API, not here.
--
-- sorted_scores is float32 and pgvector accumulates in float32, so the same
-- word can come out ~1e-7 apart here and in the pipeline. The 1e-6 tolerance
-- keeps a pool word from being ranked below its own stored score.
create function public.score_guess(p_puzzle_id bigint, p_word text)
returns table (rank int, lean real, objective double precision)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_scores  real[];
  v_lam     real;
  v_hub     real;
  v_cos_a   double precision;
  v_cos_b   double precision;
  v_lo      int;
  v_hi      int;
  v_mid     int;
begin
  select p.sorted_scores,
         p.lam,
         g.hub,
         extensions.inner_product(g.embedding, a.embedding),
         extensions.inner_product(g.embedding, b.embedding)
    into v_scores, v_lam, v_hub, v_cos_a, v_cos_b
    from public.puzzles p
    join public.words a on a.word = p.word_a
    join public.words b on b.word = p.word_b
    join public.words g on g.word = p_word
   where p.id = p_puzzle_id;

  if not found then
    return;
  end if;

  objective := least(v_cos_a, v_cos_b) - v_lam * v_hub;

  -- Binary search on the descending array for the first score that doesn't
  -- beat the objective. Everything before it beats the guess.
  v_lo := 1;
  v_hi := cardinality(v_scores) + 1;
  while v_lo < v_hi loop
    v_mid := (v_lo + v_hi) / 2;
    if v_scores[v_mid] > objective + 1e-6 then
      v_lo := v_mid + 1;
    else
      v_hi := v_mid;
    end if;
  end loop;

  rank := v_lo;
  lean := v_cos_b - v_cos_a;
  return next;
end;
$$;

-- Supabase grants execute on new public functions to anon and authenticated,
-- which would let anyone call this through the Data API and scrape rankings.
revoke execute on function public.score_guess(bigint, text) from public, anon, authenticated;
grant execute on function public.score_guess(bigint, text) to service_role;
