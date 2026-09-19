import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client untuk Client Components (browser).
 * Memakai ANON key + session dari cookie => RLS aktif per user.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Env NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY belum di-set.",
    );
  }

  return createBrowserClient(url, anonKey);
}
