import { NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { GalatPindah, terapkanPindahBukti } from "@/lib/pindah-server";

/**
 * Kartu "Jadikan pindah BRI → DANA" dari screenshot sisi lawan (SPEC-kantong-sendiri B-7).
 * Body: { id, updated_at, kantong_lawan, merchant } dari usulan /api/upload-receipt
 * (`pindahBukti`). RPC jadikan_pindah memeriksa ulang semuanya (milik sendiri, rekening
 * koran, belum berubah). Jawaban: { ok, n, salinan } — Urungkan lewat /api/kantong/pindah/urungkan.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Sesi kamu udah abis. Masuk lagi ya." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const teks = (k: string) => (typeof b?.[k] === "string" ? (b[k] as string) : "");
  if (!teks("id") || !teks("updated_at") || !teks("kantong_lawan")) return NextResponse.json({ error: "Transaksinya belum dipilih." }, { status: 400 });
  try {
    const { n, salinan } = await terapkanPindahBukti(supabase, { id: teks("id"), updated_at: teks("updated_at"), kantong_lawan: teks("kantong_lawan"), merchant: teks("merchant") });
    return NextResponse.json({ ok: true, n, salinan });
  } catch (e) {
    if (e instanceof GalatPindah) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("jadikan pindah (bukti):", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Gagal menjadikan pindah kantong. Coba lagi." }, { status: 500 });
  }
}
