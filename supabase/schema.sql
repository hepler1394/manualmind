-- ManualMind schema. Run once in the Supabase SQL editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',
  stripe_customer_id text,
  current_period_end timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.manuals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text,
  body text not null,
  meta jsonb,
  official_manual text,
  created_at timestamptz default now()
);
create index if not exists manuals_user_idx on public.manuals(user_id, created_at desc);

create table if not exists public.usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ip text,
  kind text not null,
  created_at timestamptz default now()
);
create index if not exists usage_user_idx on public.usage(user_id, created_at);
create index if not exists usage_ip_idx on public.usage(ip, created_at);

alter table public.profiles enable row level security;
alter table public.manuals enable row level security;
alter table public.usage enable row level security;

drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

drop policy if exists "own manuals" on public.manuals;
create policy "own manuals" on public.manuals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- usage is written only by the service role (bypasses RLS); no public policies.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
