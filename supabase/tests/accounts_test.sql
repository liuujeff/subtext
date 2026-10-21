-- daily_results and merge_guest (fixtures in 1990, made-up ids).
begin;
select plan(10);

insert into public.words (id, word, freq_rank, in_pool, hub, embedding) values
  (9100001, 'qqcamel', 9100001, true, 0.1, extensions.l2_normalize((array[1, 0] || array_fill(0::real, array[298]))::extensions.halfvec(300))),
  (9100002, 'qqship',  9100002, true, 0.1, extensions.l2_normalize((array[0, 1] || array_fill(0::real, array[298]))::extensions.halfvec(300)));

insert into public.puzzles (kind, play_date, round, word_a, word_b, lam, sorted_scores, top_answers)
select 'daily', ('1990-01-0' || d)::date, 0, 'qqcamel', 'qqship', 1.0, '{0.5,0.4}', '[]'
  from generate_series(1, 2) as d;
insert into public.puzzles (kind, play_date, round, word_a, word_b, lam, sorted_scores, top_answers)
values ('daily', '1990-01-03', 0, 'qqcamel', 'qqship', 1.0, '{0.5,0.4}', '[]');

create temp table p as select id, play_date from public.puzzles where play_date between '1990-01-01' and '1990-01-03';

-- Player ...0a: day 1 finished by 3 guesses (best 70); day 2 has 1 guess (open unless the expiry
-- passed in is shorter than the time since 1990);
-- day 3 finished by a rank-1 guess but started on the wrong New York day.
insert into public.round_starts (player_id, puzzle_id, started_at)
select '00000000-0000-0000-0000-00000000000a', id,
       case play_date when '1990-01-01' then '1990-01-01 17:00+00'::timestamptz
                      when '1990-01-02' then '1990-01-02 17:00+00'::timestamptz
                      else '1990-02-01 17:00+00'::timestamptz end
  from p;
insert into public.guesses (player_id, puzzle_id, guess_no, word, rank, points, lean)
select '00000000-0000-0000-0000-00000000000a', id, n, 'w' || n, case when play_date = '1990-01-03' then 1 else 50 end,
       case n when 1 then 70 else 10 end, 0
  from p, generate_series(1, 3) as n
 where play_date = '1990-01-01' or (play_date = '1990-01-03' and n = 1) or (play_date = '1990-01-02' and n = 1);

select results_eq(
  $$select play_date::text, finished, points, hits from public.daily_results('00000000-0000-0000-0000-00000000000a', 2000000000)$$,
  $$values ('1990-01-01', 1, 70, 0), ('1990-01-02', 0, 70, 0)$$,
  'a finished round counts; an open one does not; a start on the wrong day is left out'
);
select is((select finished from public.daily_results('00000000-0000-0000-0000-00000000000a', 2000000000) where play_date = '1990-01-02'), 0, 'an open round is unfinished');
select is((select finished from public.daily_results('00000000-0000-0000-0000-00000000000a', -1) where play_date = '1990-01-02'), 1, 'it finishes once its clock runs out');
select is((select count(*) from public.daily_results('00000000-0000-0000-0000-0000000000ff', 2000000000)), 0::bigint, 'a stranger has no results');

-- day_distribution: only player ...0a played day 1 so far, finished with 70 points (bucket 1).
select results_eq(
  $$select bucket, players from public.day_distribution('1990-01-01', 2000000000, 1)$$,
  $$values (1, 1)$$,
  'a finished day lands in its 50-point bucket'
);
select is((select count(*) from public.day_distribution('1990-01-01', 2000000000, 2)), 0::bigint, 'a day with fewer finished rounds than required is left out');

-- merge_guest: guest ...0b played days 1 and 2; user ...0c already played day 1.
insert into public.round_starts (player_id, puzzle_id, started_at)
select u, id, now() from p, unnest(array['00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c']::uuid[]) as u
 where play_date = '1990-01-01' or (play_date = '1990-01-02' and u = '00000000-0000-0000-0000-00000000000b');
insert into public.guesses (player_id, puzzle_id, guess_no, word, rank, points, lean)
select u, id, 1, 'guest', 5, 55, 0 from p, unnest(array['00000000-0000-0000-0000-00000000000b']::uuid[]) as u where play_date = '1990-01-01';
insert into public.guesses (player_id, puzzle_id, guess_no, word, rank, points, lean)
select '00000000-0000-0000-0000-00000000000c', id, 1, 'mine', 9, 44, 0 from p where play_date = '1990-01-01';

select is(public.merge_guest('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c'), 2, 'merge reports the guest had two puzzles');
select results_eq(
  $$select word from public.guesses where player_id = '00000000-0000-0000-0000-00000000000c' and word in ('guest', 'mine')$$,
  array['mine'],
  'the account keeps its own rounds'
);
select is((select count(*) from public.round_starts where player_id = '00000000-0000-0000-0000-00000000000c'), 2::bigint, 'the account gains the guest-only round');
select is(public.merge_guest('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c'), 0, 'the guest has nothing left to merge');

select * from finish();
rollback;
