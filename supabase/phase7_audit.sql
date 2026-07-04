-- Phase 7: audit fixes (applied 2026-07-04 via MCP migration "audit_fixes_rls_perf_security")

-- 1) RLS initplan: wrap auth.uid() in (select ...) so it evaluates once per query, not per row.
alter policy "own chats" on public.manual_chats
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own manuals" on public.manuals
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own profile select" on public.profiles
  using ((select auth.uid()) = id);
alter policy "own profile update" on public.profiles
  using ((select auth.uid()) = id);
alter policy "own reminders" on public.reminders
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own spaces" on public.spaces
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 2) Security: handle_new_user is a trigger function; nobody should call it over the API.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- 3) Performance: cover the manual_chats.user_id foreign key.
create index if not exists manual_chats_user_idx on public.manual_chats(user_id);
