-- Flavor Scorecard: how each humor flavor's captions did with real voters.
-- Votes live on captions (caption_votes.vote_value: +1 / -1) and every caption
-- records the flavor that wrote it (captions.humor_flavor_id), so a flavor's
-- record is the sum of its captions' votes. Run this in the Supabase SQL editor
-- (this repo has no migration runner). Read-only: nothing here writes data.

-- Only Matrix users (superadmins or matrix admins) may read the scorecard.
create or replace function public.scorecard_allowed()
returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_superadmin or p.is_matrix_admin)
  )
$$;

-- One row per flavor that has captions: totals, thumbs-up rate, last vote.
create or replace function public.flavor_scorecard()
returns table (
  flavor_id bigint,
  slug text,
  caption_count bigint,
  voted_captions bigint,
  votes bigint,
  up bigint,
  down bigint,
  up_rate numeric,
  last_vote timestamptz
)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.scorecard_allowed() then
    raise exception 'Matrix admins only';
  end if;
  return query
  with per_caption as (
    select c.id, c.humor_flavor_id,
           count(v.id) as votes,
           count(v.id) filter (where v.vote_value > 0) as up,
           count(v.id) filter (where v.vote_value < 0) as down,
           max(v.created_datetime_utc) as last_vote
    from public.captions c
    left join public.caption_votes v on v.caption_id = c.id
    where c.humor_flavor_id is not null
    group by c.id, c.humor_flavor_id
  )
  select pc.humor_flavor_id::bigint,
         coalesce(f.slug, 'flavor-' || pc.humor_flavor_id)::text,
         count(*)::bigint,
         (count(*) filter (where pc.votes > 0))::bigint,
         sum(pc.votes)::bigint,
         sum(pc.up)::bigint,
         sum(pc.down)::bigint,
         (case when sum(pc.votes) > 0 then round(sum(pc.up)::numeric / sum(pc.votes), 4) end)::numeric,
         max(pc.last_vote)::timestamptz
  from per_caption pc
  left join public.humor_flavors f on f.id = pc.humor_flavor_id
  group by pc.humor_flavor_id, f.slug;
end;
$$;

-- Detail for one flavor: weekly trend plus its best and worst captions.
-- A caption needs at least p_min_caption_votes votes to count as best/worst,
-- so one lucky thumbs-up doesn't top the list.
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
    left join public.caption_votes v on v.caption_id = c.id
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
    from public.caption_votes v
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

revoke execute on function public.scorecard_allowed() from public, anon;
revoke execute on function public.flavor_scorecard() from public, anon;
revoke execute on function public.flavor_scorecard_detail(bigint, int) from public, anon;
grant execute on function public.scorecard_allowed() to authenticated;
grant execute on function public.flavor_scorecard() to authenticated;
grant execute on function public.flavor_scorecard_detail(bigint, int) to authenticated;
