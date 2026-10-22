import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client untuk Server Components / Route Handlers.
 * Membaca & menulis session lewat cookie => RLS tetap berlaku sesuai user login.
 * Stateless: dibuat baru per-request (best practice serverless).
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Env NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY belum di-set.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Dipanggil dari Server Component (read-only): aman diabaikan,
          // refresh session ditangani oleh middleware.
        }
      },
    },
  });
}

/**
 * User yang sedang masuk, dari JWT di cookie yang diverifikasi di server ini
 * (getClaims: tanda tangan ES256 dicek dengan kunci publik JWKS project) —
 * tanpa bolak-balik ke Supabase Auth seperti getUser(), yang dulu dipanggil
 * 2–3 kali per pindah halaman. cache(): layout dan halaman dalam satu request
 * berbagi satu hasil.
 *
 * ponytail: sesi yang dicabut (keluar di perangkat lain) baru tertolak saat
 * JWT-nya kedaluwarsa (±1 jam). Pakai getUser() untuk aksi yang butuh lebih ketat.
 */
export const ambilUser = cache(
  async (): Promise<{ id: string; email: string | null; onboarding: boolean } | null> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    const klaim = data?.claims;
    if (!klaim?.sub) return null;
    const meta = (klaim.user_metadata ?? {}) as Record<string, unknown>;
    return {
      id: klaim.sub,
      email: typeof klaim.email === "string" ? klaim.email : null,
      // Ditandai halaman /mulai (user_metadata ikut di JWT, jadi tanpa query).
      onboarding: Boolean(meta.onboarding_selesai),
    };
  },
);
