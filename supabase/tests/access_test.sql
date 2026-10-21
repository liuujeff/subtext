-- Access control: browsers (anon / authenticated) must never read words,
-- inflections, puzzles, round starts or another player's guesses, and must not
-- be able to call score_guess through the Data API.
begin;
select plan(33);

-- Fixtures (as postgres). Made-up words, ids and dates, so real uploaded
-- data never collides with them. ------------------------------------------

insert into public.words (id, word, freq_rank, in_pool, hub, embedding) values
  (9100001, 'qqcamel', 9100001, true, 0.1, extensions.l2_normalize((array[1, 0] || array_fill(0::real, array[298]))::extensions.halfvec(300))),
  (9100002, 'qqship',  9100002, true, 0.1, extensions.l2_normalize((array[0, 1] || array_fill(0::real, array[298]))::extensions.halfvec(300)));

insert into public.inflections (form, base) values ('qqcamels', 'qqcamel');

insert into public.puzzles (kind, play_date, round, word_a, word_b, lam, sorted_scores, top_answers)
values ('daily', '1990-01-01', 0, 'qqcamel', 'qqship', 1.0, '{0.5,0.4}', '[{"word":"desert","points":100}]');

insert into public.guesses (player_id, puzzle_id, guess_no, word, rank, points, lean)
select u, (select id from public.puzzles where play_date = '1990-01-01'), 1, 'qqcamel', 10, 71, 0.0
  from unnest(array['00000000-0000-0000-0000-00000000000a',
                    '00000000-0000-0000-0000-00000000000b']::uuid[]) as u;

-- Catalog: RLS and privileges ---------------------------------------------

select ok(relrowsecurity, format('RLS is enabled on %s', relname))
  from pg_class
 where oid in ('public.words'::regclass, 'public.inflections'::regclass,
               'public.puzzles'::regclass, 'public.guesses'::regclass,
               'public.round_starts'::regclass)
 order by relname;

select table_privs_are('public', t, r, array[]::text[], format('%s has no privileges on %s', r, t))
  from unnest(array['words', 'inflections', 'puzzles', 'round_starts']) as t,
       unnest(array['anon', 'authenticated']) as r
 order by t, r;

select table_privs_are('public', 'guesses', 'anon', array[]::text[], 'anon has no privileges on guesses');
select table_privs_are('public', 'guesses', 'authenticated', array['SELECT'], 'authenticated can only select guesses');

select function_privs_are('public', 'score_guess', array['bigint', 'text'], 'anon', array[]::text[],
  'anon cannot execute score_guess');
select function_privs_are('public', 'score_guess', array['bigint', 'text'], 'authenticated', array[]::text[],
  'authenticated cannot execute score_guess');
select function_privs_are('public', 'score_guess', array['bigint', 'text'], 'service_role', array['EXECUTE'],
  'service_role can execute score_guess');
select function_privs_are('public', 'suggest_words', array['text', 'integer'], 'anon', array[]::text[],
  'anon cannot execute suggest_words');
select function_privs_are('public', 'suggest_words', array['text', 'integer'], 'authenticated', array[]::text[],
  'authenticated cannot execute suggest_words');

-- As a signed-in (anonymous) player ---------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select results_eq(
  'select player_id from public.guesses',
  array['00000000-0000-0000-0000-00000000000a'::uuid],
  'a player sees only their own guesses'
);
select throws_ok('select * from public.words', '42501', null, 'a player cannot read words');
select throws_ok('select * from public.inflections', '42501', null, 'a player cannot read inflections');
select throws_ok('select * from public.puzzles', '42501', null, 'a player cannot read puzzles');
select throws_ok('select * from public.round_starts', '42501', null, 'a player cannot read round starts');
select throws_ok('select * from public.score_guess(1, ''camel'')', '42501', null, 'a player cannot call score_guess');
select throws_ok(
  $$insert into public.guesses (player_id, puzzle_id, guess_no, word, rank, points, lean)
    values ('00000000-0000-0000-0000-00000000000a', 1, 2, 'desert', 1, 100, 0)$$,
  '42501', null, 'a player cannot insert guesses directly'
);
select throws_ok('update public.guesses set points = 100', '42501', null, 'a player cannot update guesses');

-- Without a session --------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok('select * from public.words', '42501', null, 'anon cannot read words');
select throws_ok('select * from public.puzzles', '42501', null, 'anon cannot read puzzles');
select throws_ok('select * from public.guesses', '42501', null, 'anon cannot read guesses');
select throws_ok('select * from public.round_starts', '42501', null, 'anon cannot read round starts');
select throws_ok('select * from public.score_guess(1, ''camel'')', '42501', null, 'anon cannot call score_guess');

select * from finish();
rollback;
