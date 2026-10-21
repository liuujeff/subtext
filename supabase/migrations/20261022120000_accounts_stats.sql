-- Accounts and stats.
--
-- daily_results: one row per daily the player has played, for streaks and
-- stats. A daily only counts if the player started its rounds on its own New
-- York day (replaying a past day doesn't extend a streak). A round is
-- finished once it has 3 guesses or a rank-1 guess, or p_expire_secs have
-- passed since its start (the API passes ROUND_SECONDS + GRACE_SECONDS, so
-- the clock rules stay in src/lib/game/rules.ts).
create function public.daily_results(p_player uuid, p_expire_secs int)
returns table (play_date date, finished int, points int, hits int)
language sql
stable
set search_path = ''
as $$
  select pz.play_date,
         (count(*) filter (where r.done))::int,
         coalesce(sum(r.best), 0)::int,
         (count(*) filter (where r.hit))::int
    from public.round_starts rs
    join public.puzzles pz on pz.id = rs.puzzle_id and pz.kind = 'daily'
   cross join lateral (
     select coalesce(max(g.points), 0) as best,
            coalesce(bool_or(g.rank = 1), false) as hit,
            count(g.id) >= 3
              or coalesce(bool_or(g.rank = 1), false)
              or now() >= rs.started_at + make_interval(secs => p_expire_secs) as done
       from public.guesses g
      where g.player_id = rs.player_id and g.puzzle_id = rs.puzzle_id
   ) r
   where rs.player_id = p_player
     and (rs.started_at at time zone 'America/New_York')::date = pz.play_date
   group by pz.play_date
   order by pz.play_date;
$$;

-- merge_guest: moves a guest's rounds to the account they just signed in to.
-- A puzzle the account has already played keeps the account's rows; the
-- guest's rows for it are dropped. Returns how many puzzles the guest had
-- rows for (0 = nothing to merge).
create function public.merge_guest(p_guest uuid, p_user uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_all   bigint[];
  v_moved bigint[];
begin
  if p_guest = p_user then
    return 0;
  end if;

  select coalesce(array_agg(distinct puzzle_id), '{}') into v_all
    from (select puzzle_id from public.round_starts where player_id = p_guest
          union all
          select puzzle_id from public.guesses where player_id = p_guest) g;

  select coalesce(array_agg(p), '{}') into v_moved
    from unnest(v_all) as p
   where not exists (select 1 from public.round_starts where player_id = p_user and puzzle_id = p)
     and not exists (select 1 from public.guesses where player_id = p_user and puzzle_id = p);

  update public.round_starts set player_id = p_user
   where player_id = p_guest and puzzle_id = any (v_moved);
  update public.guesses set player_id = p_user
   where player_id = p_guest and puzzle_id = any (v_moved);

  delete from public.round_starts where player_id = p_guest;
  delete from public.guesses where player_id = p_guest;

  return coalesce(array_length(v_all, 1), 0);
end;
$$;

-- Server only, like score_guess: Supabase grants new functions to anon and
-- authenticated.
revoke all on function public.daily_results(uuid, int) from public, anon, authenticated;
revoke all on function public.merge_guest(uuid, uuid) from public, anon, authenticated;
grant execute on function public.daily_results(uuid, int) to service_role;
grant execute on function public.merge_guest(uuid, uuid) to service_role;
