-- Phase 4 migration: public SEO manual pages.
-- Run in the Supabase SQL editor if you set up before Phase 4.

alter table public.manuals add column if not exists public_slug text;
alter table public.manuals add column if not exists published_at timestamptz;

create unique index if not exists manuals_public_slug_idx
  on public.manuals(public_slug) where public_slug is not null;

-- Anyone (anon key) may read a manual its owner explicitly published.
drop policy if exists "published manuals are public" on public.manuals;
create policy "published manuals are public" on public.manuals
  for select using (public_slug is not null);
