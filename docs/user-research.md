# User research — what tracker-app communities like & wish for

Recurring themes across MacroFactor, Cronometer, MyFitnessPal, and Lose It community
discussions (aggregated from review/summary sources, not raw forum quotes; paraphrased).
Sources: outlift MacroFactor review, feastgood MF-vs-Cronometer, Good Men Project
"8 best trackers per Reddit" (2026), MacroFactor help docs.

## Loved
- Adaptive, data-driven TDEE that adjusts targets from real intake + weight trend (most praised).
- Trend-weight smoothing (signal through daily noise).
- Flexibility over perfection — soft adherence / ranges, not punishing daily misses.
- Transparency & education — the app explaining *why* it recommends what it does.
- Progress beyond the scale — measurements, photos, body composition, health metrics.
- Fast logging + verified food database + barcode (food-logging apps).
- Micronutrient depth (Cronometer).

## Wished for / complained about
- Cost / paywall (MacroFactor no free tier).
- No desktop/web version (MacroFactor).
- Deeper micronutrients in MF (sodium, sugar, sat fat, water).
- Data ownership / export.
- Logging friction; want faster/AI/photo logging + accurate database.
- Habit/streak tracking and a weekly check-in ritual.
- GLP-1 / medication-assisted context (growing).
- Progress photos & body measurements (waist, etc.).

## How this app already stacks up
Strong where people rave AND where MacroFactor falls short:
- Adaptive data-driven TDEE ✅ · trend smoothing ✅ · flexibility via ranges ✅
- Transparency / cited explainers ✅ · **web access** ✅ (MF's #1 gap) · **data export** ✅
- Goal ETA/projection ✅ (MF lacks) · phases (cut/maintain/recomp/bulk) ✅
- Food logging / database / barcode / cost — N/A by design (Cronometer does logging upstream).

## Candidate gaps (ranked for THIS app)
1. Body measurements + progress photos — top "beyond-the-scale" wish (already spec'd as future work).
   NOTE: progress photos likely **not feasible** on the free tier — Supabase Storage limits;
   measurements (waist/hip) would be cheap (just more entry types).
2. Key micronutrients (sodium, sugar, saturated fat, water) — Cronometer already tracks these,
   so viable if the export bridge carries a few more fields (schema + bridge tweak).
3. Weekly check-in "moment" — evolve the "This week" card into a coaching-style recap.
4. Consistency streak — light motivation built on existing logging-coverage data.

Not pursued: photos (storage). Others parked pending priority.
