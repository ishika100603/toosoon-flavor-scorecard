-- Counted votes (Nov 17). About a third of caption_votes were cast less than
-- 1 second after the same person's previous vote: too fast to have read the
-- caption, and often several in the same second, which looks automated. The
-- scorecard now counts only votes cast 1+ second after that person's previous
-- vote (or their first vote). Everything (ranking, flavor pages, audience,
-- captions voted) reads from this one set, and a summary row says how many
-- votes were left out and when the counted votes were cast.
-- Refresh, in this order, after new votes are loaded:
--   refresh materialized view public.scorecard_counted_votes;
--   refresh materialized view public.scorecard_vote_summary;
--   refresh materialized view public.scorecard_flavor_voters;
--   refresh materialized view public.scorecard_flavor_captions;

drop function if exists public.flavor_scorecard(int, numeric, numeric);
drop function if exists public.scorecard_summary();
drop materialized view if exists public.scorecard_flavor_voters;
drop materialized view if exists public.scorecard_flavor_captions;
drop materialized view if exists public.scorecard_vote_summary;
drop materialized view if exists public.scorecard_counted_votes;

create materialized view public.scorecard_counted_votes as
with v as (
  select v.id, v.caption_id, v.profile_id, v.vote_value, v.created_datetime_utc, v.is_from_study,
         extract(epoch from v.created_datetime_utc - lag(v.created_datetime_utc)
           over (partition by v.profile_id order by v.created_datetime_utc)) as gap_s
  from public.caption_votes v
)
select id, caption_id, profile_id, vote_value, created_datetime_utc, is_from_study
from v
where gap_s is null or gap_s >= 1;
create unique index on public.scorecard_counted_votes (id);
create index on public.scorecard_counted_votes (caption_id);

create materialized view public.scorecard_vote_summary as
select (select count(*) from public.caption_votes) as all_votes,
       count(*) as counted_votes,
       min(created_datetime_utc) as first_vote,
       max(created_datetime_utc) as last_vote,
       count(*) filter (where created_datetime_utc < '2026-05-15') as spring_votes
from public.scorecard_counted_votes;

create materialized view public.scorecard_flavor_voters as
select c.humor_flavor_id as flavor_id, v.profile_id,
       count(*)::int as votes,
       (count(*) filter (where v.vote_value > 0))::int as up,
       (count(*) filter (where v.vote_value < 0))::int as down,
       max(v.created_datetime_utc) as last_vote
from public.scorecard_counted_votes v
join public.captions c on c.id = v.caption_id
where c.humor_flavor_id is not null
group by c.humor_flavor_id, v.profile_id;
create index on public.scorecard_flavor_voters (flavor_id);

create materialized view public.scorecard_flavor_captions as
select c.humor_flavor_id as flavor_id,
       count(*)::bigint as caption_count,
       (count(*) filter (where exists (select 1 from public.scorecard_counted_votes v where v.caption_id = c.id)))::bigint as voted_captions
from public.captions c
where c.humor_flavor_id is not null
group by c.humor_flavor_id;
create unique index on public.scorecard_flavor_captions (flavor_id);

revoke all on public.scorecard_counted_votes, public.scorecard_vote_summary, public.scorecard_flavor_voters, public.scorecard_flavor_captions from public, anon, authenticated;

create function public.scorecard_summary()
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.scorecard_allowed() then
    raise exception 'Matrix admins only';
  end if;
  return (select to_jsonb(s) from public.scorecard_vote_summary s);
end;
$$;

create function public.flavor_scorecard(p_fast_ms int default 1000, p_rush_share numeric default 0.2, p_same_share numeric default 2)
returns table (
  flavor_id bigint, slug text, caption_count bigint, voted_captions bigint,
  votes bigint, up bigint, down bigint, up_rate numeric, last_vote timestamptz,
  voters bigint, regulars bigint, fans bigint, critics bigint,
  clean_votes bigint, clean_up_rate numeric, flagged_voters bigint
)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.scorecard_allowed() then
    raise exception 'Matrix admins only';
  end if;
  return query
  with flagged as (
    select s.profile_id
    from public.study_voter_stats s
    where s.shared_session
       or (s.votes >= 30 and (
             s.median_ms < p_fast_ms
          or (p_rush_share > 0 and s.median_ms >= 2 * p_fast_ms
              and (case p_fast_ms when 500 then s.under_500 when 2000 then s.under_2000 else s.under_1000 end) >= p_rush_share)
          or s.top_share >= p_same_share))
  ),
  per_flavor as (
    select fv.flavor_id,
           sum(fv.votes) as votes, sum(fv.up) as up, sum(fv.down) as down,
           max(fv.last_vote) as last_vote,
           count(*) as voters,
           count(*) filter (where fv.votes >= 10) as regulars,
           count(*) filter (where fv.votes >= 10 and fv.up::numeric / fv.votes >= 0.7) as fans,
           count(*) filter (where fv.votes >= 10 and fv.up::numeric / fv.votes <= 0.3) as critics,
           sum(fv.votes) filter (where fl.profile_id is null) as clean_votes,
           sum(fv.up) filter (where fl.profile_id is null) as clean_up,
           count(fl.profile_id) as flagged_voters
    from public.scorecard_flavor_voters fv
    left join flagged fl on fl.profile_id = fv.profile_id
    group by fv.flavor_id
  )
  select fc.flavor_id::bigint,
         coalesce(f.slug, 'flavor-' || fc.flavor_id)::text,
         fc.caption_count, fc.voted_captions,
         coalesce(pf.votes, 0)::bigint, coalesce(pf.up, 0)::bigint, coalesce(pf.down, 0)::bigint,
         (case when pf.votes > 0 then round(pf.up::numeric / pf.votes, 4) end)::numeric,
         pf.last_vote::timestamptz,
         coalesce(pf.voters, 0)::bigint, coalesce(pf.regulars, 0)::bigint,
         coalesce(pf.fans, 0)::bigint, coalesce(pf.critics, 0)::bigint,
         coalesce(pf.clean_votes, 0)::bigint,
         (case when pf.clean_votes > 0 then round(pf.clean_up::numeric / pf.clean_votes, 4) end)::numeric,
         coalesce(pf.flagged_voters, 0)::bigint
  from public.scorecard_flavor_captions fc
  left join per_flavor pf on pf.flavor_id = fc.flavor_id
  left join public.humor_flavors f on f.id = fc.flavor_id;
end;
$$;

create or replace function public.flavor_scorecard_detail(p_flavor_id bigint, p_min_caption_votes int default 5)
returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  result jsonb;
begin
  if not public.scorecard_allowed() then
    raise exception 'Matrix admins only';
  end if;
  with per_caption as (
    select c.id, c.content, c.image_id,
           count(v.id) as votes,
           count(v.id) filter (where v.vote_value > 0) as up,
           count(v.id) filter (where v.vote_value < 0) as down
    from public.captions c
    left join public.scorecard_counted_votes v on v.caption_id = c.id
    where c.humor_flavor_id = p_flavor_id
    group by c.id
  ),
  ranked as (
    select pc.*, i.url as image_url,
           round(pc.up::numeric / nullif(pc.votes, 0), 4) as up_rate
    from per_caption pc
    left join public.images i on i.id = pc.image_id
    where pc.votes >= p_min_caption_votes
  ),
  weekly as (
    select date_trunc('week', v.created_datetime_utc) as week,
           count(*) as votes,
           count(*) filter (where v.vote_value > 0) as up
    from public.scorecard_counted_votes v
    join public.captions c on c.id = v.caption_id
    where c.humor_flavor_id = p_flavor_id
    group by 1
  )
  select jsonb_build_object(
    'best', coalesce((select jsonb_agg(to_jsonb(b)) from (
      select id, content, image_url, votes, up, down, up_rate from ranked
      order by up_rate desc, votes desc limit 3) b), '[]'::jsonb),
    'worst', coalesce((select jsonb_agg(to_jsonb(w)) from (
      select id, content, image_url, votes, up, down, up_rate from ranked
      order by up_rate asc, votes desc limit 3) w), '[]'::jsonb),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object(
      'week', week, 'votes', votes, 'up_rate', round(up::numeric / nullif(votes, 0), 4)) order by week)
      from weekly), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.flavor_scorecard(int, numeric, numeric) from public, anon;
revoke execute on function public.scorecard_summary() from public, anon;
grant execute on function public.flavor_scorecard(int, numeric, numeric) to authenticated;
grant execute on function public.scorecard_summary() to authenticated;
