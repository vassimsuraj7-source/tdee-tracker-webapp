-- Migration: diet phases (post-launch feature).
-- A diet phase is a period with an intent — cut (deficit), maintain, or bulk
-- (surplus) — with a start date and an optional end date (null = the current,
-- ongoing phase). This lets the owner plan and review sequential phases rather than
-- a single goal. Single-user app: no user partitioning (consistent with the rest).

create table if not exists public.diet_phases (
  id          uuid primary key default gen_random_uuid(),
  phase_type  text not null check (phase_type in ('cut', 'maintain', 'bulk')),
  start_date  date not null,
  end_date    date,                              -- null => ongoing (the current phase)
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

-- At most one ongoing phase (end_date is null) at a time.
create unique index if not exists diet_phases_one_open
  on public.diet_phases ((end_date is null))
  where end_date is null;

create index if not exists diet_phases_start on public.diet_phases (start_date);

-- Keep updated_at fresh (reuses the shared trigger function from the schema migration).
drop trigger if exists trg_diet_phases_touch on public.diet_phases;
create trigger trg_diet_phases_touch
  before update on public.diet_phases
  for each row execute function public.touch_updated_at();

-- Security: match every other table (RLS on; authenticated owner full access; anon
-- denied; service_role bypasses RLS but still needs table GRANTs). "Auto-expose new
-- tables" is OFF, so the grants are explicit.
alter table public.diet_phases enable row level security;
create policy owner_all on public.diet_phases for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.diet_phases to authenticated;
grant select, insert, update, delete on public.diet_phases to service_role;
