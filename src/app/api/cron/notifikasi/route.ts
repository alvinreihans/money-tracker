import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isiNotifikasi, type DataNotifikasi } from "@/lib/notifikasi";
import { kirimPush, type Langganan } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Push notifikasi harian, dipanggil cron Vercel 12.00 UTC = 19.00 WIB
 * (vercel.json). Vercel mengirim `Authorization: Bearer $CRON_SECRET`.
 *
 * Sekaligus menyentuh database tiap hari, jadi project Supabase gratis tidak
 * ter-pause karena tidak aktif.
 */
export async function GET(req: NextRequest) {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia || req.headers.get("authorization") !== `Bearer ${rahasia}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await db.rpc("data_notifikasi");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (data ?? []) as (DataNotifikasi & { langganan: Langganan[] })[];
  const asal = new URL(req.url).origin;
  let terkirim = 0;
  const mati: string[] = [];
  const gagal: string[] = [];
  for (const u of users) {
    const notifikasi = isiNotifikasi(u);
    if (notifikasi.length === 0) continue;
    const r = await kirimPush(u.langganan, notifikasi, asal);
    terkirim += r.terkirim;
    mati.push(...r.mati);
    gagal.push(...r.gagal);
  }
  if (mati.length) await db.from("push_langganan").delete().in("endpoint", mati);
  if (gagal.length) console.error("push gagal:", gagal);

  return NextResponse.json({ pengguna: users.length, terkirim, dibuang: mati.length, gagal: gagal.length });
}
