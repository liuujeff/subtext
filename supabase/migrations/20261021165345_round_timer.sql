-- Round clock. Each round lasts ROUND_SECONDS (src/lib/game/rules.ts) from the
-- moment the player starts it, and starting is also what reveals the pair, so
-- a row here means the player has seen the clue words. The API writes
-- started_at from its own clock and compares it with the same clock.
--
-- player_id works as in guesses: a guest id or a Supabase user id, no foreign
-- key. A started round counts as played: upload.py never changes or removes it.
create table public.round_starts (
  player_id   uuid not null,
  puzzle_id   bigint not null references public.puzzles (id),
  started_at  timestamptz not null,
  primary key (player_id, puzzle_id)
);

create index round_starts_puzzle_id_idx on public.round_starts (puzzle_id);

-- Server only, like words and puzzles.
alter table public.round_starts enable row level security;
revoke all on public.round_starts from anon, authenticated;
