-- Scorecard v3 (PM feedback, Nov 11): the scorecard and the suspicious-voter
-- check in one table. Each flavor also gets its thumbs-up rate without the
-- suspicious voters, using the same rules as the Suspicious study voters page
-- (defaults: typical vote under 1 s, 20%+ rushed votes, shared session; same
-- answer off). Reads the summary tables, so it stays instant.
drop function if exists public.flavor_scorecard();
drop function if exists public.flavor_scorecard(int, numeric, numeric);
create function public.flavor_scorecard(p_fast_ms int default 1000, p_rush_share numeric default 0.2, p_same_share numeric default 2)
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
  critics bigint,
  clean_votes bigint,
  clean_up_rate numeric,
  flagged_voters bigint
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
         fc.caption_count,
         fc.voted_captions,
         coalesce(pf.votes, 0)::bigint,
         coalesce(pf.up, 0)::bigint,
         coalesce(pf.down, 0)::bigint,
         (case when pf.votes > 0 then round(pf.up::numeric / pf.votes, 4) end)::numeric,
         pf.last_vote::timestamptz,
         coalesce(pf.regulars, 0)::bigint,
         coalesce(pf.fans, 0)::bigint,
         coalesce(pf.critics, 0)::bigint,
         coalesce(pf.clean_votes, 0)::bigint,
         (case when pf.clean_votes > 0 then round(pf.clean_up::numeric / pf.clean_votes, 4) end)::numeric,
         coalesce(pf.flagged_voters, 0)::bigint
  from public.scorecard_flavor_captions fc
  left join per_flavor pf on pf.flavor_id = fc.flavor_id
  left join public.humor_flavors f on f.id = fc.flavor_id;
end;
$$;

revoke execute on function public.flavor_scorecard(int, numeric, numeric) from public, anon;
grant execute on function public.flavor_scorecard(int, numeric, numeric) to authenticated;
