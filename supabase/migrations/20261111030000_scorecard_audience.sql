-- Scorecard v2 (PM feedback, Nov 11):
--   * Shows how many of a flavor's captions got any vote ("captions voted"),
--     since some flavors write far more captions than people vote on.
--   * Audience: whether a flavor splits its regular voters. Kyle noted that
--     different audiences (e.g. grad vs undergrad) can like different flavors.
--     The course data has no audience info (majors/universities are empty), so
--     the split is measured from the votes themselves: among voters with 10+
--     votes on the flavor, "fans" liked 70%+ of what they voted on and
--     "critics" liked 30% or less.
--   * Faster: per-flavor totals are worked out once into summary tables, so the
--     ranking no longer re-reads every vote (it took ~4 s).
-- Refresh after new votes are loaded:
--   refresh materialized view public.scorecard_flavor_voters;
--   refresh materialized view public.scorecard_flavor_captions;

drop materialized view if exists public.scorecard_flavor_voters;
drop materialized view if exists public.scorecard_flavor_captions;

-- One row per flavor and voter
create materialized view public.scorecard_flavor_voters as
select c.humor_flavor_id as flavor_id, v.profile_id,
       count(*)::int as votes,
       (count(*) filter (where v.vote_value > 0))::int as up,
       (count(*) filter (where v.vote_value < 0))::int as down,
       max(v.created_datetime_utc) as last_vote
from public.caption_votes v
join public.captions c on c.id = v.caption_id
where c.humor_flavor_id is not null
group by c.humor_flavor_id, v.profile_id;
create index on public.scorecard_flavor_voters (flavor_id);

-- One row per flavor: captions written and captions with at least one vote
create materialized view public.scorecard_flavor_captions as
select c.humor_flavor_id as flavor_id,
       count(*)::bigint as caption_count,
       (count(*) filter (where exists (select 1 from public.caption_votes v where v.caption_id = c.id)))::bigint as voted_captions
from public.captions c
where c.humor_flavor_id is not null
group by c.humor_flavor_id;
create unique index on public.scorecard_flavor_captions (flavor_id);

revoke all on public.scorecard_flavor_voters from public, anon, authenticated;
revoke all on public.scorecard_flavor_captions from public, anon, authenticated;

drop function if exists public.flavor_scorecard();
create function public.flavor_scorecard()
returns table (
  flavor_id bigint,
  slug text,
  caption_count bigint,
  voted_captions bigint,
  votes bigint,
  up bigint,
  down bigint,
  up_rate numeric,
  last_vote timestamptz,
  regulars bigint,
  fans bigint,
  critics bigint
)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.scorecard_allowed() then
    raise exception 'Matrix admins only';
  end if;
  return query
  with per_flavor as (
    select fv.flavor_id,
           sum(fv.votes) as votes, sum(fv.up) as up, sum(fv.down) as down,
           max(fv.last_vote) as last_vote,
           count(*) filter (where fv.votes >= 10) as regulars,
           count(*) filter (where fv.votes >= 10 and fv.up::numeric / fv.votes >= 0.7) as fans,
           count(*) filter (where fv.votes >= 10 and fv.up::numeric / fv.votes <= 0.3) as critics
    from public.scorecard_flavor_voters fv
    group by fv.flavor_id
  )
  select fc.flavor_id::bigint,
         coalesce(f.slug, 'flavor-' || fc.flavor_id)::text,
         fc.caption_count,
         fc.voted_captions,
         coalesce(pf.votes, 0)::bigint,
         coalesce(pf.up, 0)::bigint,
         coalesce(pf.down, 0)::bigint,
         (case when pf.votes > 0 then round(pf.up::numeric / pf.votes, 4) end)::numeric,
         pf.last_vote::timestamptz,
         coalesce(pf.regulars, 0)::bigint,
         coalesce(pf.fans, 0)::bigint,
         coalesce(pf.critics, 0)::bigint
  from public.scorecard_flavor_captions fc
  left join per_flavor pf on pf.flavor_id = fc.flavor_id
  left join public.humor_flavors f on f.id = fc.flavor_id;
end;
$$;

revoke execute on function public.flavor_scorecard() from public, anon;
grant execute on function public.flavor_scorecard() to authenticated;
