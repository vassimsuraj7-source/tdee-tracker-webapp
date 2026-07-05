import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Browser Supabase client. Uses the publishable (anon) key and persists the user
 * session; all data access runs as the authenticated owner under RLS. The
 * service_role key is never used in the browser (Req 22.7).
 */
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
