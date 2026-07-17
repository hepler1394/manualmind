-- Phase 8: search log powering the background auto-library
-- (applied 2026-07-17 via MCP migration "search_log_autolibrary")
create table if not exists public.search_log (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists search_log_created_idx on public.search_log(created_at desc);
-- Service-role only (same posture as usage): RLS on, no client policies.
alter table public.search_log enable row level security;
