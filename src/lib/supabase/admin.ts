import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client dengan SERVICE ROLE (bypass RLS).
 * WAJIB server-only. Dipakai oleh webhook Telegram yang tidak punya
 * session user, sehingga perlu menulis data atas nama user tertentu.
 * Stateless: tanpa persist/refresh session.
 */
let cached: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum di-set.",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
