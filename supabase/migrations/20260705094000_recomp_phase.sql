-- Migration: allow the "recomp" (body recomposition) diet phase.
-- Extends the diet_phases.phase_type CHECK to include 'recomp'. Recomposition runs a
-- gentle deficit with high protein + resistance training to lose fat while
-- preserving/building muscle. Additive and idempotent; no data is altered.

alter table public.diet_phases drop constraint if exists diet_phases_phase_type_check;
alter table public.diet_phases
  add constraint diet_phases_phase_type_check
  check (phase_type in ('cut', 'maintain', 'bulk', 'recomp'));
