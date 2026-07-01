-- Phase 2 migration for an existing Phase 1 database. Safe to run once.

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);
create index if not exists spaces_user_idx on public.spaces(user_id, created_at);

alter table public.manuals
  add column if not exists space_id uuid references public.spaces(id) on delete set null;
create index if not exists manuals_space_idx on public.manuals(space_id);

create table if not exists public.manual_chats (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references public.manuals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);
create index if not exists chats_manual_idx on public.manual_chats(manual_id, created_at);

alter table public.spaces enable row level security;
alter table public.manual_chats enable row level security;

drop policy if exists "own spaces" on public.spaces;
create policy "own spaces" on public.spaces for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own chats" on public.manual_chats;
create policy "own chats" on public.manual_chats for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
