import { NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { muatCalonPindah } from "@/lib/pindah-server";

/**
 * Calon "Jadikan pindah kantong?" untuk kantong ini (SPEC-kantong-sendiri A-3):
 * pengeluaran/pemasukan rekening koran yang tampaknya pindah ke/dari kantong itu.
 * Tidak mengubah apa pun. Jawaban: { kantong, calon: CalonPindah[], kalimat }.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Sesi kamu udah abis. Masuk lagi ya." }, { status: 401 });
  const { id } = await params;
  try {
    const hasil = await muatCalonPindah(supabase, id);
    if (!hasil) return NextResponse.json({ error: "Kantongnya tidak ditemukan." }, { status: 404 });
    return NextResponse.json(hasil);
  } catch (e) {
    console.error("calon pindah:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Gagal memuat transaksi lama. Coba lagi." }, { status: 500 });
  }
}
