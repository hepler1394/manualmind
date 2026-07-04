-- Phase 5: scheduled email reminders. Safe to run once.
-- Tracks the last day we emailed a reminder, so the daily cron does not repeat.

alter table public.reminders
  add column if not exists last_emailed_on date;
