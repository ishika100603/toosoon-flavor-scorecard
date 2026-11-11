-- Study voter check: flags humor-study voters whose votes look careless or gamed,
-- and shows how much they move each flavor's result. Read-only; Matrix admins only.
--
-- Signals (a voter needs 30+ study votes to be judged):
--   * Too fast: their typical (median) time per vote is under 1 second, too quick
--     to have read the caption. Uses time_to_vote_ms when the app recorded it,
--     otherwise the time since their previous vote (the two agree within ~20 ms
--     where both exist). Gaps over 10 minutes are breaks and are ignored.
--   * Same answer: 95%+ of their votes are one answer.
-- Funny / very funny count as a thumbs up; every other answer counts as not.
create or replace function public.study_voter_check(p_min_votes int default 30, p_fast_ms int default 1000, p_same_share numeric default 0.95)
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  result jsonb;
begin
  if not public.scorecard_allowed() then
    raise exception 'Matrix admins only';
  end if;
  with e as (
    select ev.profile_id, ev.caption_id, ev.study_caption_mapping_id, ev.vote_value::text as v,
           coalesce(ev.time_to_vote_ms::numeric,
             extract(epoch from ev.created_datetime_utc - lag(ev.created_datetime_utc)
               over (partition by ev.profile_id, ev.session_id order by ev.created_datetime_utc)) * 1000) as ms
    from public.study_caption_vote_events ev
  ),
  answers as (
    select profile_id, v, count(*) as c,
           row_number() over (partition by profile_id order by count(*) desc) as rk
    from e group by profile_id, v
  ),
  voters as (
    select e.profile_id,
           count(*) as votes,
           percentile_cont(0.5) within group (order by e.ms) filter (where e.ms between 0 and 600000) as median_ms,
           count(distinct m.study_id) as studies
    from e left join public.study_caption_mappings m on m.id = e.study_caption_mapping_id
    group by e.profile_id
  ),
  judged as (
    select v.*, a.v as top_answer, a.c::numeric / v.votes as top_share,
           (v.median_ms < p_fast_ms) as too_fast,
           (a.c::numeric / v.votes >= p_same_share) as same_answer
    from voters v join answers a on a.profile_id = v.profile_id and a.rk = 1
    where v.votes >= p_min_votes
  ),
  flagged as (select profile_id from judged where too_fast or same_answer),
  per_flavor as (
    select c.humor_flavor_id as flavor_id,
           count(*) as votes,
           count(*) filter (where e.v in ('funny', 'very funny')) as up,
           count(*) filter (where f.profile_id is null) as clean_votes,
           count(*) filter (where f.profile_id is null and e.v in ('funny', 'very funny')) as clean_up
    from e
    join public.captions c on c.id = e.caption_id
    left join flagged f on f.profile_id = e.profile_id
    where c.humor_flavor_id is not null
    group by c.humor_flavor_id
  )
  select jsonb_build_object(
    'rules', jsonb_build_object('min_votes', p_min_votes, 'fast_ms', p_fast_ms, 'same_share', p_same_share),
    'judged', (select count(*) from judged),
    'too_few', (select count(*) from voters where votes < p_min_votes),
    'flagged', (select count(*) from flagged),
    'votes_total', (select count(*) from e),
    'votes_flagged', (select count(*) from e join flagged using (profile_id)),
    'voters', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', left(j.profile_id::text, 8),
               'votes', j.votes,
               'median_ms', round(j.median_ms),
               'top_answer', j.top_answer,
               'top_share', round(j.top_share, 3),
               'studies', j.studies,
               'too_fast', j.too_fast,
               'same_answer', j.same_answer)
             order by (j.too_fast and j.same_answer) desc, j.votes desc)
      from judged j where j.too_fast or j.same_answer), '[]'::jsonb),
    'flavors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'flavor_id', p.flavor_id,
               'slug', coalesce(hf.slug, 'flavor-' || p.flavor_id),
               'votes', p.votes,
               'clean_votes', p.clean_votes,
               'rate', round(p.up::numeric / p.votes, 4),
               'clean_rate', case when p.clean_votes > 0 then round(p.clean_up::numeric / p.clean_votes, 4) end)
             order by abs(coalesce(p.clean_up::numeric / nullif(p.clean_votes, 0), 0) - p.up::numeric / p.votes) desc)
      from per_flavor p left join public.humor_flavors hf on hf.id = p.flavor_id
      where p.votes >= 200), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.study_voter_check(int, int, numeric) from public, anon;
grant execute on function public.study_voter_check(int, int, numeric) to authenticated;
