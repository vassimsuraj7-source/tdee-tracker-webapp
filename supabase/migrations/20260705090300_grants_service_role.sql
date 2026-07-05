-- Migration: grant table privileges to service_role (Task 2 follow-up).
-- The project was created with "Automatically expose new tables" OFF, so no role
-- received automatic privileges on our manually-created tables. RLS migration
-- already granted the authenticated (browser) role. Edge Functions, the recompute
-- job, and integration tests use the service_role, which bypasses RLS but still
-- needs table-level GRANTs. This grants them explicitly (Req 22.7 keeps this role
-- server-side only).

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.weight_entries,
  public.body_fat_entries,
  public.step_entries,
  public.calorie_entries,
  public.tdee_records,
  public.user_goals,
  public.user_profile,
  public.current_target,
  public.sync_state
  to service_role;
