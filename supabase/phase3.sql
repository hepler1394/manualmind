-- Phase 3 migration: maintenance reminders. Safe to run once.

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  manual_id uuid references public.manuals(id) on delete cascade,
  label text not null,
  interval_days int not null default 90,
  next_due date not null default (current_date + 90),
  created_at timestamptz default now()
);
create index if not exists reminders_user_idx on public.reminders(user_id, next_due);
create index if not exists reminders_manual_idx on public.reminders(manual_id);

alter table public.reminders enable row level security;

drop policy if exists "own reminders" on public.reminders;
create policy "own reminders" on public.reminders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
