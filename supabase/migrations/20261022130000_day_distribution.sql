-- day_distribution: how everyone's totals for one daily spread out, for the
-- bell curve on the day summary. A player counts once they have finished all
-- p_rounds rounds of that day, started on the day itself (same rules as
-- daily_results). A total is the sum of each round's best guess. Returns the
-- number of players, the mean and standard deviation of their totals, and how
-- many scored strictly below p_total (the asking player's total; null gives 0).
-- Only aggregates: no player ids, words or answers.
create function public.day_distribution(p_date date, p_expire_secs int, p_rounds int, p_total int)
returns table (players int, mean double precision, sd double precision, below int)
language sql
stable
set search_path = ''
as $$
  with per_round as (
    select rs.player_id,
           coalesce(max(g.points), 0) as best,
           count(g.id) >= 3
             or coalesce(bool_or(g.rank = 1), false)
             or now() >= rs.started_at + make_interval(secs => p_expire_secs) as done
      from public.puzzles pz
      join public.round_starts rs on rs.puzzle_id = pz.id
      left join public.guesses g on g.player_id = rs.player_id and g.puzzle_id = rs.puzzle_id
     where pz.kind = 'daily' and pz.play_date = p_date
       and (rs.started_at at time zone 'America/New_York')::date = p_date
     group by rs.player_id, rs.puzzle_id, rs.started_at
  ), totals as (
    select player_id, sum(best) as total
      from per_round
     group by player_id
    having count(*) filter (where done) >= p_rounds
  )
  select count(*)::int,
         coalesce(avg(total), 0)::double precision,
         coalesce(stddev_pop(total), 0)::double precision,
         (count(*) filter (where total < p_total))::int
    from totals;
$$;

revoke all on function public.day_distribution(date, int, int, int) from public, anon, authenticated;
grant execute on function public.day_distribution(date, int, int, int) to service_role;
