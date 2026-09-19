import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Titik pendaratan tautan dari email Supabase (reset password, konfirmasi akun).
 *
 * Tautannya membawa `code` sekali-pakai yang harus ditukar jadi session di sisi
 * server supaya cookie-nya ikut ter-set. Tanpa langkah ini, halaman tujuan
 * terbuka tanpa session dan user cuma lihat "sesi habis".
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=tautan-tidak-valid`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Tautan reset cuma berlaku sekali dan ada masa berlakunya.
    return NextResponse.redirect(`${origin}/login?error=tautan-kedaluwarsa`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
