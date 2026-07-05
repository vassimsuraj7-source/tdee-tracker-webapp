-- Migration: core schema for TDEETracker Webapp (Task 2.1)
-- Single-user app: no user_id partitioning. One row per metric per day.
-- Apply via the dashboard SQL Editor (Path A) or `supabase db push` (Path B).

-- ---------------------------------------------------------------------------
-- Shared: keep an updated_at column current on mutation.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Health metric tables. Each keyed by entry_date (start-of-local-day) so that
-- ingestion upserts are idempotent by construction (Req 2, 3).
-- ---------------------------------------------------------------------------
create table if not exists public.weight_entries (
  entry_date  date primary key,
  value_kg    double precision not null check (value_kg >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.body_fat_entries (
  entry_date      date primary key,
  value_fraction  double precision not null check (value_fraction >= 0 and value_fraction <= 1),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.step_entries (
  entry_date  date primary key,
  steps       double precision not null check (steps >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.calorie_entries (
  entry_date  date primary key,
  calories    double precision not null check (calories >= 0),
  protein_g   double precision check (protein_g >= 0),
  carbs_g     double precision check (carbs_g >= 0),
  fat_g       double precision check (fat_g >= 0),
  fiber_g     double precision check (fiber_g >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Calculated TDEE history, keyed by window_end so recompute overwrites the
-- same-window result rather than duplicating (Req 15.2).
-- ---------------------------------------------------------------------------
create table if not exists public.tdee_records (
  window_end    date primary key,
  window_start  date not null,
  value         double precision not null,
  valid_days    integer not null check (valid_days between 0 and 12),
  computed_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Goals. order_index = -1 is the single Main_Goal per type; positive integers
-- are ordered Subgoals (Req 8, 9).
-- ---------------------------------------------------------------------------
create table if not exists public.user_goals (
  id                    uuid primary key default gen_random_uuid(),
  goal_type             text not null check (goal_type in ('weight', 'body_fat', 'steps')),
  target_value          double precision not null,
  goal_date             date,
  order_index           smallint not null,
  current_value_at_set  double precision,
  is_completed          boolean not null default false,
  completion_date       timestamptz,
  date_set              timestamptz not null default now()
);

-- At most one Main_Goal (order_index = -1) per goal_type (Req 8.2).
create unique index if not exists user_goals_one_main_per_type
  on public.user_goals (goal_type)
  where order_index = -1;

-- ---------------------------------------------------------------------------
-- Singleton profile (Req 7). id is pinned to 1.
-- ---------------------------------------------------------------------------
create table if not exists public.user_profile (
  id             smallint primary key default 1 check (id = 1),
  name           text,
  date_of_birth  date,
  height_cm      double precision check (height_cm > 0),
  gender         text check (gender in ('male', 'female', 'other')),
  activity_pal   double precision check (activity_pal > 0),
  calorie_goal   double precision,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Singleton current calorie-target snapshot the dashboard reads (Req 16.6).
-- ---------------------------------------------------------------------------
create table if not exists public.current_target (
  id                 smallint primary key default 1 check (id = 1),
  calorie_target     double precision,
  tdee_used          double precision,
  tdee_source        text check (tdee_source in ('data-driven', 'estimated', 'undetermined')),
  rate_capped        boolean not null default false,
  date_unachievable  boolean not null default false,
  warning            text,
  computed_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Singleton sync state: when the last accepted Health_Payload arrived (Req 2.6).
-- ---------------------------------------------------------------------------
create table if not exists public.sync_state (
  id            smallint primary key default 1 check (id = 1),
  last_sync_at  timestamptz
);

-- Seed the singletons so the app always has a row to read/update.
insert into public.user_profile (id) values (1) on conflict (id) do nothing;
insert into public.current_target (id) values (1) on conflict (id) do nothing;
insert into public.sync_state (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at triggers on mutable tables.
-- ---------------------------------------------------------------------------
create trigger trg_weight_touch    before update on public.weight_entries    for each row execute function public.touch_updated_at();
create trigger trg_bodyfat_touch   before update on public.body_fat_entries  for each row execute function public.touch_updated_at();
create trigger trg_steps_touch     before update on public.step_entries      for each row execute function public.touch_updated_at();
create trigger trg_calorie_touch   before update on public.calorie_entries   for each row execute function public.touch_updated_at();
create trigger trg_profile_touch   before update on public.user_profile      for each row execute function public.touch_updated_at();
