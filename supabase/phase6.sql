-- Phase 6: community-manual verification (applied 2026-07-04 via MCP migration "manual_verification")
alter table public.manuals add column if not exists verified boolean not null default false;
alter table public.manuals add column if not exists edited_at timestamptz;

-- Existing published manuals (AI-generated, unedited) start verified.
update public.manuals set verified = true where public_slug is not null;
