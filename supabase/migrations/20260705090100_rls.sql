-- Migration: Row Level Security (Task 2.2)
-- Single-user app. The one account (Supabase Auth "authenticated" role) gets full
-- access; the anonymous role gets none, so unauthenticated Webapp requests are
-- denied (Req 20.1, Correctness Property 8). The service_role used by Edge
-- Functions bypasses RLS server-side (Req 22.7) and needs no policy.

alter table public.weight_entries    enable row level security;
alter table public.body_fat_entries  enable row level security;
alter table public.step_entries      enable row level security;
alter table public.calorie_entries   enable row level security;
alter table public.tdee_records       enable row level security;
alter table public.user_goals         enable row level security;
alter table public.user_profile       enable row level security;
alter table public.current_target     enable row level security;
alter table public.sync_state          enable row level security;

-- Full access for the authenticated owner (single user). No anon policy => anon denied.
create policy owner_all on public.weight_entries    for all to authenticated using (true) with check (true);
create policy owner_all on public.body_fat_entries  for all to authenticated using (true) with check (true);
create policy owner_all on public.step_entries      for all to authenticated using (true) with check (true);
create policy owner_all on public.calorie_entries   for all to authenticated using (true) with check (true);
create policy owner_all on public.tdee_records       for all to authenticated using (true) with check (true);
create policy owner_all on public.user_goals         for all to authenticated using (true) with check (true);
create policy owner_all on public.user_profile       for all to authenticated using (true) with check (true);
create policy owner_all on public.current_target     for all to authenticated using (true) with check (true);
create policy owner_all on public.sync_state          for all to authenticated using (true) with check (true);

-- Deliberately expose these tables to the Data API for the authenticated role.
-- Required because the project is created with "Automatically expose new tables"
-- OFF (manual access control). RLS above is still the security boundary; these
-- grants only make the tables reachable via PostgREST for the logged-in owner.
-- The service_role (Edge Functions) already has full access and is unaffected.
grant usage on schema public to authenticated;
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
  to authenticated;
