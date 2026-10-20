import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dipanggil Vercel Cron (lihat vercel.json) agar project Supabase free tier
 * tidak di-pause karena tidak ada aktivitas. Cukup satu query ringan ke DB.
 */
export async function GET(req: NextRequest) {
  // Vercel mengirim "Authorization: Bearer <CRON_SECRET>" bila env itu di-set.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { error } = await createSupabaseAdminClient()
    .from("transactions")
    .select("id")
    .limit(1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
