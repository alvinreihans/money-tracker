import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKategori } from "@/lib/kategori-server";
import { dbErrorMessage } from "@/lib/errors";
import { cariSerupa } from "@/lib/ingat";
import { kategoriJenis } from "@/lib/kategori";
import { KELOMPOK } from "@/lib/metode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JENIS = ["expense", "income"] as const;
type Jenis = (typeof JENIS)[number];

/**
 * Membetulkan kategori semua transaksi dari satu merchant (SPEC-ingat-kategori):
 * dipakai setelah Ubah transaksi dan koreksi di obrolan Catat. (Usulan Tanya AI
 * "X itu kategori Y" lewat RPC terapkan_usulan, SPEC-asisten-agen keputusan 35.)
 *
 * GET  ?merchant&type&kategori&kecuali → { jumlah, total }: berapa yang akan ikut berubah.
 * POST { merchant, type, kategori, kelompok?, kecuali? }
 *      → { diubah, sebelum: [{ id, category, kelompok }], kategori: { slug, name } }.
 * Transaksinya selalu dicari ulang di server; daftar id dari browser tidak dipercaya.
 */
function bacaJenis(v: unknown): Jenis | null {
  return JENIS.includes(v as Jenis) ? (v as Jenis) : null;
}
const bacaMerchant = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

export async function GET(req: NextRequest) {
  if (!(await ambilUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const merchant = bacaMerchant(q.get("merchant"));
  const type = bacaJenis(q.get("type"));
  if (!merchant || !type) return NextResponse.json({ jumlah: 0, total: 0 });
  const baris = await cariSerupa(await createSupabaseServerClient(), merchant, type, { kecuali: q.get("kecuali"), bukan: q.get("kategori") });
  return NextResponse.json({ jumlah: baris.length, total: baris.reduce((n, b) => n + Number(b.amount), 0) });
}

export async function POST(req: NextRequest) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const merchant = bacaMerchant(body?.merchant);
  const type = bacaJenis(body?.type);
  if (!merchant || !type) return NextResponse.json({ error: "Merchant atau jenisnya nggak kebaca." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const daftar = kategoriJenis(await ambilKategori(supabase), type);
  const kategori = daftar.find((k) => k.slug === body?.kategori);
  if (!kategori) return NextResponse.json({ error: "Kategorinya nggak ketemu." }, { status: 400 });

  const kelompok = type === "expense" && KELOMPOK.includes(body?.kelompok as (typeof KELOMPOK)[number]) ? (body!.kelompok as string) : null;
  const baris = await cariSerupa(supabase, merchant, type, { kecuali: typeof body?.kecuali === "string" ? body.kecuali : null, bukan: kategori.slug });
  if (baris.length) {
    const { error } = await supabase
      .from("transactions")
      .update({ category: kategori.slug, kelompok })
      .in(
        "id",
        baris.map((b) => b.id),
      );
    if (error) return NextResponse.json({ error: dbErrorMessage(error) }, { status: 400 });
  }
  return NextResponse.json({
    diubah: baris.length,
    sebelum: baris.map((b) => ({ id: b.id, category: b.category, kelompok: b.kelompok ?? null })),
    kategori: { slug: kategori.slug, name: kategori.name },
  });
}
