import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { urungkanLengkapi } from "@/lib/lengkapi-server";
import { KOLOM_LENGKAPI, type IsianLengkapi } from "@/lib/lengkapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Urungkan Lengkapi (SPEC-lengkapi §7, K1): kolom yang diubah kembali ke nilai
 * lamanya, cashback ikutan yang dibuat dihapus, dan kantong e-wallet yang
 * dibuat untuknya dihapus bila sudah kosong.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof b?.id === "string" && UUID.test(b.id) ? b.id : null;
  if (!b || !id || typeof b.sebelum !== "object" || !b.sebelum) return NextResponse.json({ error: "Tidak ada yang bisa diurungkan." }, { status: 400 });
  // Hanya kolom milik Lengkapi; nominal, tanggal, kantong tidak pernah ikut.
  const sebelum: IsianLengkapi = {};
  for (const k of KOLOM_LENGKAPI) {
    const v = (b.sebelum as Record<string, unknown>)[k];
    if (v === null || typeof v === "string" || typeof v === "boolean") sebelum[k] = v;
  }
  const ikutan = typeof b.ikutan_id === "string" && UUID.test(b.ikutan_id) ? b.ikutan_id : null;
  const tx = await urungkanLengkapi(supabase, id, sebelum, ikutan);
  if (!tx) return NextResponse.json({ error: "Transaksinya sudah tidak ada." }, { status: 404 });
  if (typeof b.kantong_baru === "string" && UUID.test(b.kantong_baru)) {
    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .or(`kantong_id.eq.${b.kantong_baru},kantong_tujuan_id.eq.${b.kantong_baru}`);
    if (!count) await supabase.from("user_accounts").delete().eq("id", b.kantong_baru);
  }
  return NextResponse.json({ transaction: tx });
}
