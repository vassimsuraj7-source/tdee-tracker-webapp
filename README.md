# TDEETracker Webapp

A data-driven TDEE (Total Daily Energy Expenditure) and daily-calorie-target tracker,
built as the web successor to a native iOS app. It ingests weight, body fat, steps,
and nutrition that already flow into Apple Health (e.g. a smart scale + Cronometer),
computes TDEE with a MacroFactor-style rolling-window method, and shows a dashboard,
trend charts, and goal tracking as an installable PWA.

**Free-first stack:** Supabase (Postgres + Edge Functions + pg_cron + Auth) for the
backend, an Apple Shortcuts / Health Auto Export bridge for data, and a static PWA
hosted on any free static host (GitHub Pages, Netlify, Cloudflare Pages, Vercel).

The full spec (requirements, design, task plan) lives in [`spec/`](./spec).

## Repository layout

```
packages/engine/   Pure TDEE calculation library (TypeScript + Vitest). No I/O.
packages/server/   Data-access (repository) + recompute routine over Supabase.
supabase/          DB migrations + Edge Functions (ingest, recompute).
web/               Installable PWA frontend (Vite + TypeScript + Chart.js).
scripts/           One-off helpers (create user, generate ingest key, seed, etc.).
spec/              Requirements, design, and task plan.
```

## Use it with your own Supabase

Nothing project-specific is committed — plug in your own project via env/config.

1. **Create a Supabase project** (Free tier). Note the project URL, publishable
   (anon) key, and service_role key.
2. **Apply the database** — run the SQL in `supabase/migrations/` in order via the
   dashboard SQL Editor, or `supabase db push` with the CLI.
3. **Local env** — copy `.env.example` -> `.env` and `web/.env.example` -> `web/.env`,
   and fill in your values. `.env` is gitignored; never commit real keys.
4. **Install + build + test**
   ```bash
   npm install
   npm run build --workspace @tdee/engine
   npm run build --workspace @tdee/server
   npm run test --workspace @tdee/engine   # 55 unit/property tests
   ```
5. **Create your login**
   ```bash
   node scripts/create-user.mjs you@example.com "your-password"
   ```
6. **Deploy the Edge Functions** (Supabase CLI; no Docker needed for remote deploy)
   ```bash
   node scripts/gen-ingest-key.mjs          # prints INGEST_API_KEY + salt + hash
   npx supabase login
   npx supabase secrets set INGEST_API_KEY_SALT=... INGEST_API_KEY_HASH=... --project-ref <ref>
   npx supabase functions deploy ingest --no-verify-jwt --project-ref <ref>
   npx supabase functions deploy recompute --project-ref <ref>
   ```
7. **Schedule the nightly recompute** — run the two SQL statements documented in
   `supabase/migrations/20260705090200_extensions_cron.sql` (store the service_role
   key in Vault, then `cron.schedule`).
8. **Set up the export bridge** on your iPhone — see [`docs/shortcuts-bridge.md`](./docs/shortcuts-bridge.md).
9. **Deploy the frontend**
   - **GitHub Pages:** push to GitHub and set two repo **Variables**
     (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); the workflow in
     `.github/workflows/deploy.yml` builds and deploys on push. Enable Pages with
     source = GitHub Actions.
   - **Netlify / Cloudflare / Vercel:** build command
     `npm run build --workspace @tdee/web`, publish dir `web/dist`, and set the two
     `VITE_*` env vars.
   - **Drag-drop:** `npm run build --workspace @tdee/web` then drop `web/dist` at
     https://app.netlify.com/drop.

## Security notes

- **Never commit `.env`** (gitignored). Only the publishable/anon key and project URL
  are safe to expose (RLS-protected); the service_role key and DB password are not.
- Data is protected by Supabase Auth + Row Level Security, independent of whether the
  source code is public.
- The ingestion endpoint authenticates via a salted-hash API key (`x-api-key`);
  everything is served over TLS.

## Prerequisites

Node.js + npm are required. The Supabase CLI is needed only to deploy Edge Functions
and apply migrations from the terminal (Docker is not required for remote operations).
