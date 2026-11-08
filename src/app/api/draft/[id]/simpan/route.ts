import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { pertanyaanDraft } from "@/lib/draft";
import { GalatSimpan, muatSaldoDari, selesaikanDraft } from "@/lib/simpan-draft";
import type { Transaction } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simpan satu draft dari kartu "Periksa dulu" (SPEC-periksa-dulu §1). Hanya
 * draft yang semua isiannya lengkap (pertanyaan `konfirmasi`). `form: true`:
 * disimpan dari form Ubah — formnya sendiri adalah cek, jadi pertanyaan jam &
 * dugaan dobel tidak menghalangi (isiannya sudah diperiksa form).
 *
 * Balasan: { transaction, sebelum } — `sebelum` untuk Urungkan. 409 = masih ada
 * yang perlu ditanyakan ({ pertanyaan }).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { form?: unknown } | null;
  const form = body?.form === true;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("transactions").select("*").eq("id", id).eq("status", "needs_review").is("induk_id", null).maybeSingle();
  const tx = data as Transaction | null;
  if (!tx) return NextResponse.json({ error: "Catatan ini sudah disimpan atau sudah dihapus." }, { status: 404 });

  const q = pertanyaanDraft(tx, await muatSaldoDari(supabase));
  const boleh = q === "konfirmasi" || (form && (q === "waktu" || q === "duplikat"));
  if (!boleh) return NextResponse.json({ error: "Masih ada yang perlu dijawab dulu.", pertanyaan: q }, { status: 409 });

  try {
    return NextResponse.json(await selesaikanDraft(supabase, tx, form ? "form" : "kartu"));
  } catch (e) {
    if (e instanceof GalatSimpan) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Gagal menyimpan catatannya." }, { status: 500 });
  }
}
