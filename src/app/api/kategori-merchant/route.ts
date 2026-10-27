import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKategori } from "@/lib/kategori-server";
import { dbErrorMessage } from "@/lib/errors";
import { cariSerupa } from "@/lib/ingat";
import { kategoriJenis, slugBaru, validasiKategori, WARNA_KATEGORI, type Kategori } from "@/lib/kategori";
import { KELOMPOK } from "@/lib/metode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JENIS = ["expense", "income"] as const;
type Jenis = (typeof JENIS)[number];
const IKON_BARU = "receipt";

/**
 * Membetulkan kategori semua transaksi dari satu merchant (SPEC-ingat-kategori):
 * dipakai setelah Ubah transaksi, koreksi di obrolan Catat, dan usulan Tanya AI.
 *
 * GET  ?merchant&type&kategori&kecuali → { jumlah, total }: berapa yang akan ikut berubah.
 * POST { merchant, type, kategori | kategori_baru: { nama, kelompok }, kelompok?, kecuali? }
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
  let kategori: Pick<Kategori, "slug" | "name"> | undefined = daftar.find((k) => k.slug === body?.kategori);

  // Kategori baru dari usulan Tanya AI ("Laundry"); nama yang sudah ada dipakai lagi.
  const baru = body?.kategori_baru as { nama?: unknown; kelompok?: unknown } | undefined;
  if (!kategori && baru) {
    const nama = typeof baru.nama === "string" ? baru.nama.trim() : "";
    kategori = daftar.find((k) => k.name.toLowerCase() === nama.toLowerCase());
    if (!kategori) {
      const cek = validasiKategori(
        {
          type,
          name: nama,
          icon: IKON_BARU,
          color: WARNA_KATEGORI[daftar.length % WARNA_KATEGORI.length],
          kelompok: KELOMPOK.includes(baru.kelompok as (typeof KELOMPOK)[number]) ? baru.kelompok : "keinginan",
        },
        daftar,
      );
      if (!cek.ok) return NextResponse.json({ error: cek.error }, { status: 400 });
      const urutan = Math.max(0, ...daftar.filter((k) => k.slug !== "other").map((k) => k.sort)) + 1;
      const { data, error } = await supabase
        .from("categories")
        .insert({ ...cek.data, user_id: user.id, type, slug: slugBaru(), sort: urutan })
        .select("slug, name")
        .single();
      if (error) return NextResponse.json({ error: dbErrorMessage(error, `Kategori "${cek.data.name}"`) }, { status: 400 });
      kategori = data;
    }
  }
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
    kategori,
  });
}
