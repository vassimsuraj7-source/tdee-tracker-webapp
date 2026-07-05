import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Create a service-role Supabase client. The service role bypasses RLS and is used
 * only server-side (Edge Functions, the recompute job, and integration tests) — it
 * must never reach the browser (Req 22.7).
 */
export function createServiceClient(
  url: string | undefined = process.env.SUPABASE_URL,
  serviceRoleKey: string | undefined = process.env.SUPABASE_SERVICE_ROLE_KEY,
): SupabaseClient {
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type { SupabaseClient };
