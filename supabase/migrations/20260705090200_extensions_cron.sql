-- Migration: scheduling extensions + Daily Recompute placeholder (Task 2.3)
-- Enables pg_cron (recurring jobs in Postgres) and pg_net (HTTP from Postgres),
-- which together let the database invoke the recompute Edge Function on a schedule
-- (Req 5.4). On Supabase both are available; enabling here is idempotent.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Daily Recompute schedule (finalized in Task 7). Run once in the SQL Editor after
-- deploying the `recompute` function. The service-role key is stored in Vault so it
-- is not written in plaintext into the cron job definition. pg_cron runs in UTC;
-- 21:30 UTC is before local midnight year-round for Europe/Luxembourg (UTC+1/+2),
-- and keeps the UTC "today" aligned with the local day (Req 5.2, 5.4).
--
--   -- 1) Store the service-role key in Vault (replace <SERVICE_ROLE_KEY>):
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'recompute_service_key',
--                              'Service role key for scheduled recompute');
--
--   -- 2) Schedule the nightly recompute:
--   select cron.schedule(
--     'daily-recompute',
--     '30 21 * * *',
--     $$
--       select net.http_post(
--         url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/recompute',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'Authorization', 'Bearer ' ||
--             (select decrypted_secret from vault.decrypted_secrets where name = 'recompute_service_key')
--         ),
--         body    := '{}'::jsonb
--       );
--     $$
--   );
--
-- To replace later: select cron.unschedule('daily-recompute'); then re-run step 2.
-- To test immediately: run the inner net.http_post(...) statement on its own.
-- ---------------------------------------------------------------------------
