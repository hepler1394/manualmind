-- Phase 6: Team plan (multi-seat). Additive. Safe to run once.
-- Team members receive Pro by flipping their profiles.plan to 'pro' while the
-- team subscription is active, so all existing plan checks work unchanged.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Team',
  seats int not null default 5,
  status text not null default 'inactive',            -- inactive | active | canceled
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz default now()
);
create index if not exists teams_owner_idx on public.teams(owner_id);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',                -- owner | member
  created_at timestamptz default now(),
  primary key (team_id, user_id),
  unique (user_id)                                    -- a user belongs to at most one team
);
create index if not exists team_members_user_idx on public.team_members(user_id);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  token text not null unique,
  created_at timestamptz default now()
);
create index if not exists team_invites_team_idx on public.team_invites(team_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

-- Owners manage their own team row directly. All other reads/writes go through the
-- service role in the API (which enforces authorization in code), avoiding RLS recursion.
drop policy if exists "team owner all" on public.teams;
create policy "team owner all" on public.teams for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
