-- Adds "Rushes sometimes": a voter who normally takes their time (typical vote at
-- least twice the too-fast limit) but casts a share of votes (20%+ by default)
-- faster than that limit, e.g.
-- someone who normally reads for ~5 s but races through some votes in 1 s.
-- Rebuilds the summary tables with each voter's share of votes under 0.5, 1 and
-- 2 seconds, and replaces study_voter_check (it gains p_rush_share; 0 = off). The course data doesn't change, so refresh
-- them only after new study votes are loaded:
--   refresh materialized view public.study_voter_stats;
--   refresh materialized view public.study_flavor_voter_votes;

drop materialized view if exists public.study_flavor_voter_votes;
drop materialized view if exists public.study_voter_stats;

-- One row per study voter: speed, most common answer, studies, shared session
create materialized view public.study_voter_stats as
with e as (
  select ev.profile_id, ev.study_caption_mapping_id, ev.vote_value::text as v,
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
shared as (
  select distinct profile_id
  from public.study_caption_vote_events
  where session_id in (
    select session_id from public.study_caption_vote_events
    where session_id is not null
    group by session_id having count(distinct profile_id) > 1)
)
select e.profile_id,
       count(*)::int as votes,
       percentile_cont(0.5) within group (order by e.ms) filter (where e.ms between 0 and 600000) as median_ms,
       count(distinct m.study_id)::int as studies,
       max(a.v) as top_answer,
       max(a.c)::numeric / count(*) as top_share,
       bool_or(sh.profile_id is not null) as shared_session,
       avg((e.ms < 500)::int) filter (where e.ms between 0 and 600000) as under_500,
       avg((e.ms < 1000)::int) filter (where e.ms between 0 and 600000) as under_1000,
       avg((e.ms < 2000)::int) filter (where e.ms between 0 and 600000) as under_2000
from e
left join public.study_caption_mappings m on m.id = e.study_caption_mapping_id
join answers a on a.profile_id = e.profile_id and a.rk = 1
left join shared sh on sh.profile_id = e.profile_id
group by e.profile_id;

create unique index on public.study_voter_stats (profile_id);

-- One row per flavor and voter: how many study votes, how many "funny"
create materialized view public.study_flavor_voter_votes as
select c.humor_flavor_id as flavor_id, ev.profile_id,
       count(*)::int as votes,
       (count(*) filter (where ev.vote_value::text in ('funny', 'very funny')))::int as up
from public.study_caption_vote_events ev
join public.captions c on c.id = ev.caption_id
where c.humor_flavor_id is not null
group by c.humor_flavor_id, ev.profile_id;

create index on public.study_flavor_voter_votes (flavor_id);

-- Only reachable through the function below
revoke all on public.study_voter_stats from public, anon, authenticated;
revoke all on public.study_flavor_voter_votes from public, anon, authenticated;

drop function if exists public.study_voter_check(int, int, numeric);

create or replace function public.study_voter_check(p_min_votes int default 30, p_fast_ms int default 1000, p_same_share numeric default 0.95, p_rush_share numeric default 0.2)
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  result jsonb;
begin
  if not public.scorecard_allowed() then
    raise exception 'Matrix admins only';
  end if;
  with judged as (
    select s.*,
           (s.median_ms < p_fast_ms) as too_fast,
           (s.top_share >= p_same_share) as same_answer,
           case p_fast_ms when 500 then s.under_500 when 2000 then s.under_2000 else s.under_1000 end as rushed_share
    from public.study_voter_stats s
    where s.votes >= p_min_votes or s.shared_session
  ),
  marked as (
    select j.*, (j.median_ms >= 2 * p_fast_ms and p_rush_share > 0 and j.rushed_share >= p_rush_share) as rushes
    from judged j
  ),
  flagged as (select profile_id from marked where too_fast or rushes or same_answer or shared_session),
  per_flavor as (
    select fv.flavor_id,
           sum(fv.votes) as votes,
           sum(fv.up) as up,
           sum(fv.votes) filter (where f.profile_id is null) as clean_votes,
           sum(fv.up) filter (where f.profile_id is null) as clean_up
    from public.study_flavor_voter_votes fv
    left join flagged f on f.profile_id = fv.profile_id
    group by fv.flavor_id
  )
  select jsonb_build_object(
    'rules', jsonb_build_object('min_votes', p_min_votes, 'fast_ms', p_fast_ms, 'same_share', p_same_share),
    'judged', (select count(*) from marked),
    'shared', (select count(*) from public.study_voter_stats where shared_session),
    'too_few', (select count(*) from public.study_voter_stats where votes < p_min_votes),
    'flagged', (select count(*) from flagged),
    'votes_total', (select coalesce(sum(votes), 0) from public.study_voter_stats),
    'votes_flagged', (select coalesce(sum(s.votes), 0) from public.study_voter_stats s join flagged using (profile_id)),
    'voters', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', left(j.profile_id::text, 8),
               'votes', j.votes,
               'median_ms', round(j.median_ms),
               'top_answer', j.top_answer,
               'top_share', round(j.top_share, 3),
               'studies', j.studies,
               'too_fast', j.too_fast,
               'same_answer', j.same_answer,
               'shared_session', j.shared_session,
               'rushes', j.rushes,
               'rushed_share', round(j.rushed_share, 3))
             order by j.shared_session desc, j.votes desc)
      from marked j where j.too_fast or j.rushes or j.same_answer or j.shared_session), '[]'::jsonb),
    'flavors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'flavor_id', p.flavor_id,
               'slug', coalesce(hf.slug, 'flavor-' || p.flavor_id),
               'votes', p.votes,
               'clean_votes', coalesce(p.clean_votes, 0),
               'rate', round(p.up::numeric / p.votes, 4),
               'clean_rate', case when p.clean_votes > 0 then round(p.clean_up::numeric / p.clean_votes, 4) end)
             order by abs(coalesce(p.clean_up::numeric / nullif(p.clean_votes, 0), 0) - p.up::numeric / p.votes) desc)
      from per_flavor p left join public.humor_flavors hf on hf.id = p.flavor_id
      where p.votes >= 200), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.study_voter_check(int, int, numeric, numeric) from public, anon;
grant execute on function public.study_voter_check(int, int, numeric, numeric) to authenticated;
