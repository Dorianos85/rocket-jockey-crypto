-- Rocket Jockey's Edge Function is the only database API for rankings.
-- Apply this schema to the selected Supabase project before deploying rocket-ranked.
begin;

create table if not exists public.rocket_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique default ('Pilot-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  provider text not null check (provider in ('phantom', 'google', 'other')),
  created_at timestamptz not null default now(),
  constraint rocket_handle_format check (handle ~ '^Pilot-[a-f0-9]{12}$')
);

create table if not exists public.rocket_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.rocket_profiles(user_id) on delete cascade,
  seed integer not null check (seed >= 0),
  status text not null default 'active' check (status in ('active', 'verified', 'rejected')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  finished_at timestamptz,
  score integer check (score between 0 and 1000000),
  deliveries integer check (deliveries between 0 and 10000),
  duration numeric check (duration between 0 and 90),
  reason text check (reason in ('time', 'destroyed')),
  replay_hash text,
  constraint rocket_verified_result check (
    status <> 'verified' or
    (finished_at is not null and score is not null and deliveries is not null and duration is not null and reason is not null)
  ),
  constraint rocket_run_expiry check (expires_at > started_at)
);

create index if not exists rocket_runs_user_started_idx on public.rocket_runs (user_id, started_at desc);
create index if not exists rocket_runs_verified_score_idx on public.rocket_runs (score desc, finished_at asc) where status = 'verified';

alter table public.rocket_profiles enable row level security;
alter table public.rocket_runs enable row level security;
revoke all on table public.rocket_profiles, public.rocket_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.rocket_profiles, public.rocket_runs to service_role;

-- The Edge Function calls this aggregate with service-role credentials only.
-- SECURITY INVOKER preserves the caller's normal privileges and RLS behavior.
create or replace function public.rocket_leaderboard()
returns table (handle text, provider text, best_score integer, deliveries integer, total_runs bigint)
language sql stable security invoker set search_path = ''
as $$
  with ranked as (
    select r.user_id, r.score, r.deliveries, r.finished_at,
      row_number() over (partition by r.user_id order by r.score desc, r.finished_at asc, r.id asc) as position,
      count(*) over (partition by r.user_id) as total_runs
    from public.rocket_runs r
    where r.status = 'verified'
  )
  select p.handle, p.provider, r.score, r.deliveries, r.total_runs
  from ranked r
  join public.rocket_profiles p on p.user_id = r.user_id
  where r.position = 1
  order by r.score desc, r.finished_at asc, p.handle asc
  limit 50;
$$;

revoke all on function public.rocket_leaderboard() from public, anon, authenticated;
grant execute on function public.rocket_leaderboard() to service_role;

-- Deliberately no anon/authenticated policies, views, triggers, or SECURITY DEFINER RPCs.
-- The Edge Function verifies auth using getUser(), selects only the caller's run,
-- replays inputs, and atomically updates WHERE status = 'active' AND user_id = auth user.
-- Public leaderboard responses contain generated handles and aggregate scores only.
commit;
