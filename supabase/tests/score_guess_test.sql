-- score_guess ranking and the table constraints that enforce game rules.
begin;
select plan(19);

-- 300-dim unit vector from its first two components.
create function pg_temp.vec(x real, y real) returns extensions.halfvec
language sql as $$
  select extensions.l2_normalize((array[x, y] || array_fill(0::real, array[298]))::extensions.halfvec(300))
$$;

-- Made-up words, ids and dates so uploaded data never collides.
-- cos(even, A) = cos(even, B) ~ 0.707; cos(tilted, A) ~ 0.316, cos(tilted, B) ~ 0.949.
insert into public.words (id, word, freq_rank, in_pool, hub, embedding) values
  (9100001, 'qqalpha',  9100001, true,  0.0,  pg_temp.vec(1, 0)),
  (9100002, 'qqbravo',  9100002, true,  0.0,  pg_temp.vec(0, 1)),
  (9100003, 'qqeven',   9100003, true,  0.1,  pg_temp.vec(1, 1)),  -- objective ~ 0.607
  (9100004, 'qqtilted', 9100004, true,  0.0,  pg_temp.vec(1, 3)),  -- objective ~ 0.316
  (9100005, 'qqpeak',   9100005, true, -0.5,  pg_temp.vec(1, 1)),  -- objective ~ 1.207
  (9100006, 'qqgeneric',9100006, false, 0.9,  pg_temp.vec(1, 1));  -- objective ~ -0.193

insert into public.puzzles (kind, play_date, round, word_a, word_b, lam, sorted_scores, top_answers)
values ('daily', '1990-01-01', 0, 'qqalpha', 'qqbravo', 1.0, '{0.9,0.7,0.5,0.1}', '[]');

create temp table p as select id from public.puzzles where play_date = '1990-01-01';

-- Ranking ------------------------------------------------------------------

select is((select rank from public.score_guess((select id from p), 'qqeven')), 3,
  'rank counts the scores strictly above the objective');
select is((select rank from public.score_guess((select id from p), 'qqtilted')), 4,
  'a weaker guess ranks lower');
select is((select rank from public.score_guess((select id from p), 'qqpeak')), 1,
  'a guess above every score is rank 1');
select is((select rank from public.score_guess((select id from p), 'qqgeneric')), 5,
  'a guess below every score ranks after the whole pool');
select ok((select abs(objective - (0.70703125 - 0.1)) < 1e-4 from public.score_guess((select id from p), 'qqeven')),
  'objective = min(cos A, cos B) - lam * hub');

select ok((select abs(lean) < 1e-3 from public.score_guess((select id from p), 'qqeven')),
  'a balanced guess has lean ~ 0');
select ok((select lean > 0.6 from public.score_guess((select id from p), 'qqtilted')),
  'lean is positive toward B');

-- A pool word must rank level with its own stored (float32) score.
update public.puzzles
   set sorted_scores = array[0.9, (select objective from public.score_guess((select id from p), 'qqeven'))::real, 0.5]
 where id = (select id from p);
select is((select rank from public.score_guess((select id from p), 'qqeven')), 2,
  'a tie with a stored score is not counted as beating the guess');

update public.puzzles set lam = 0, sorted_scores = '{0.9,0.7,0.5,0.1}' where id = (select id from p);
select is((select rank from public.score_guess((select id from p), 'qqeven')), 2,
  'the hub penalty uses the puzzle''s own lam');

select is_empty($$select * from public.score_guess((select id from p), 'qqzebra')$$,
  'an unknown word returns no row');
select is_empty($$select * from public.score_guess(-1, 'qqeven')$$,
  'an unknown puzzle returns no row');

-- Constraints --------------------------------------------------------------

insert into public.guesses (player_id, puzzle_id, guess_no, word, rank, points, lean)
values ('00000000-0000-0000-0000-00000000000a', (select id from p), 1, 'qqeven', 3, 86, 0);

select throws_ok(
  $$insert into public.guesses (player_id, puzzle_id, guess_no, word, rank, points, lean)
    values ('00000000-0000-0000-0000-00000000000a', (select id from p), 1, 'qqtilted', 4, 83, 0.6)$$,
  '23505', null, 'two guesses cannot share a guess number'
);
select throws_ok(
  $$insert into public.guesses (player_id, puzzle_id, guess_no, word, rank, points, lean)
    values ('00000000-0000-0000-0000-00000000000a', (select id from p), 2, 'qqeven', 3, 86, 0)$$,
  '23505', null, 'the same word cannot be guessed twice'
);
select throws_ok(
  $$insert into public.guesses (player_id, puzzle_id, guess_no, word, rank, points, lean)
    values ('00000000-0000-0000-0000-00000000000a', (select id from p), 4, 'qqtilted', 4, 83, 0.6)$$,
  '23514', null, 'there is no 4th guess'
);
select throws_ok(
  $$insert into public.puzzles (kind, word_a, word_b, lam, sorted_scores, top_answers)
    values ('daily', 'qqalpha', 'qqbravo', 1, '{1}', '[]')$$,
  '23514', null, 'a daily puzzle needs a date and round'
);
select throws_ok(
  $$insert into public.puzzles (kind, play_date, round, word_a, word_b, lam, sorted_scores, top_answers)
    values ('random', '1990-01-02', 0, 'qqalpha', 'qqbravo', 1, '{1}', '[]')$$,
  '23514', null, 'a random puzzle has no date'
);
select lives_ok(
  $$insert into public.puzzles (kind, word_a, word_b, lam, sorted_scores, top_answers)
    values ('random', 'qqalpha', 'qqbravo', 1, '{1}', '[]'), ('random', 'qqalpha', 'qqeven', 1, '{1}', '[]')$$,
  'random puzzles can share a null date'
);
select lives_ok(
  $$insert into public.puzzles (kind, play_date, round, word_a, word_b, lam, sorted_scores, top_answers)
    values ('daily', '1990-01-01', 4, 'qqalpha', 'qqbravo', 1, '{1}', '[]')$$,
  'a day has up to five rounds (0-4)'
);
select throws_ok(
  $$insert into public.puzzles (kind, play_date, round, word_a, word_b, lam, sorted_scores, top_answers)
    values ('daily', '1990-01-01', 5, 'qqalpha', 'qqbravo', 1, '{1}', '[]')$$,
  '23514', null, 'but not a sixth'
);

select * from finish();
rollback;
