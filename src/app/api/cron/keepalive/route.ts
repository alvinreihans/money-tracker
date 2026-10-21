import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dipanggil Vercel Cron (lihat vercel.json) agar project Supabase free tier
 * tidak di-pause karena tidak ada aktivitas. Cukup satu query ringan ke DB:
 * fungsi keepalive() (migrasi 20261024000000), lewat anon key — tidak butuh
 * service role, dan anon tetap tidak punya akses ke tabel mana pun.
 */
export async function GET(req: NextRequest) {
  // Vercel mengirim "Authorization: Bearer <CRON_SECRET>" bila env itu di-set.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.rpc("keepalive");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
