import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilBerkas, bacaBerkas, bacaPilihan, susunRencana } from "@/lib/rekening/server";
import { NAMA_BANK } from "@/lib/rekening/jenis";

/**
 * Pratinjau impor rekening koran (SPEC-impor-rekening §3): membaca PDF dan
 * menyusun rencana tanpa mengubah apa pun. PDF tidak disimpan.
 *
 * FormData: berkas (PDF, boleh beberapa), pilihan (JSON, lihat Pilihan di
 * src/lib/rekening/rencana.ts).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Sesi kamu udah abis. Masuk lagi ya." }, { status: 401 });

  const form = await req.formData();
  const { berkas, galat: galatUnggah } = ambilBerkas(form);
  if (galatUnggah) return NextResponse.json({ error: galatUnggah }, { status: 400 });

  try {
    const { bacaan, galat } = await bacaBerkas(berkas);
    // Satu berkas tidak terbaca/tidak cocok → impor ditolak seluruhnya (spec §2).
    if (galat.length) return NextResponse.json({ galat }, { status: 422 });
    const { rencana, kantong } = await susunRencana(supabase, bacaan, bacaPilihan(form.get("pilihan")));
    return NextResponse.json({
      rekening: rencana.rekening,
      belumDipetakan: rencana.belumDipetakan,
      kantongBaru: rencana.kantongBaru.map((k) => ({ kunci: k.kunci, name: k.name, kind: k.kind })),
      tawaranDeposito: rencana.tawaranDeposito,
      tawaranJadikan: rencana.tawaranJadikan,
      // Kantong e-wallet/bank/paylater sendiri yang belum ada (SPEC-kantong-sendiri A-2, D-3).
      tawaranKantong: rencana.tawaranKantong,
      ragu: rencana.ragu,
      ringkas: rencana.ringkas,
      // Pilihan jawaban "kantong yang mana?": kantong uang milik user.
      pilihanKantong: kantong
        .filter((k) => k.kind === "bank" || k.kind === "ewallet" || k.kind === "cash")
        .map((k) => ({ id: k.id, name: k.name, kind: k.kind, emoji: (k as { emoji?: string | null }).emoji ?? null })),
      bank: Object.fromEntries(rencana.belumDipetakan.map((r) => [r.kunci, NAMA_BANK[r.bank]])),
    });
  } catch (e) {
    console.error("pratinjau rekening:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Rekening korannya gagal dibaca. Coba lagi." }, { status: 500 });
  }
}
