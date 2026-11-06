import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKonteksAI } from "@/lib/kategori-server";
import { hasilKirimanUlang } from "@/lib/receipt";
import { GalatLengkapi, isiDariDraft, terapkanLengkapi } from "@/lib/lengkapi-server";
import { isiDariEkstraksi } from "@/lib/lengkapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Lengkapi transaksi yang sudah tercatat (docs/specs/SPEC-lengkapi.md §2, §4):
 *  - { id, hasil, sidik?, gantiKategori?, buatDompet? }: dari kartu "Lengkapi
 *    transaksi ini?" — hasil baca gambar yang dikirim balik (tanpa AI lagi);
 *  - { id, draft }: "Lengkapi yang sudah ada" dari draft "sudah tercatat?";
 *    draft-nya dihapus sesudahnya.
 * Nominal, tanggal, dan kantong tidak berubah.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof b?.id === "string" && UUID.test(b.id) ? b.id : null;
  if (!b || !id) return NextResponse.json({ error: "Transaksinya tidak dikenali." }, { status: 400 });

  try {
    if (typeof b.draft === "string" && UUID.test(b.draft)) {
      if (b.draft === id) return NextResponse.json({ error: "Transaksinya tidak dikenali." }, { status: 400 });
      const d = await isiDariDraft(supabase, b.draft);
      if (!d) return NextResponse.json({ error: "Catatan ini sudah selesai atau sudah dihapus." }, { status: 404 });
      const r = await terapkanLengkapi(supabase, user.id, id, d.isi, { paksa: true, dompet: d.dompet, buatDompet: false });
      await supabase.from("transactions").delete().eq("id", b.draft);
      return NextResponse.json(r);
    }
    const konteks = await ambilKonteksAI(supabase);
    const hasil = hasilKirimanUlang(b.hasil, konteks);
    if (!hasil.extracted || hasil.status !== "confirmed") return NextResponse.json({ error: "Hasil baca gambarnya tidak lengkap." }, { status: 422 });
    const sidik = typeof b.sidik === "string" && /^[0-9a-f]{16}$/.test(b.sidik) ? b.sidik : null;
    const r = await terapkanLengkapi(supabase, user.id, id, isiDariEkstraksi(hasil.extracted, sidik), {
      dompet: hasil.extracted.dompet,
      gantiKategori: b.gantiKategori === true,
      buatDompet: b.buatDompet === true,
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof GalatLengkapi) return NextResponse.json({ error: err.message }, { status: 409 });
    return NextResponse.json({ error: "Gagal melengkapi transaksinya." }, { status: 500 });
  }
}
