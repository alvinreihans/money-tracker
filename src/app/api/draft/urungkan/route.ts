import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { TEKS_MAKS } from "@/lib/transaksi-input";
import { urungkanSimpan, type SebelumSimpan } from "@/lib/simpan-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** Isi sebelum Simpan dari klien, dibersihkan: hanya kolom yang diubah Simpan. */
function bersihkan(x: unknown): SebelumSimpan | null {
  if (!x || typeof x !== "object") return null;
  const s = x as Record<string, unknown>;
  const teks = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
  return {
    raw_ocr_text: teks(s.raw_ocr_text, 20_000),
    bukti_transfer: teks(s.bukti_transfer, 5_000),
    cicilan_id: typeof s.cicilan_id === "string" && UUID.test(s.cicilan_id) ? s.cicilan_id : null,
    cicilan_ke: Number.isInteger(s.cicilan_ke) ? (s.cicilan_ke as number) : null,
    description: teks(s.description, Math.max(500, TEKS_MAKS)),
  };
}

/**
 * Urungkan "Simpan semua" (SPEC-periksa-dulu §2): transaksi yang baru tersimpan
 * kembali jadi draft "Tinggal dicek", dengan jejak & thumbnail-nya.
 * Body: { items: { id, sebelum }[] } (sebelum = dari balasan Simpan).
 */
export async function POST(req: NextRequest) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 50).flatMap((x) => {
    const i = x as { id?: unknown; sebelum?: unknown };
    const sebelum = bersihkan(i?.sebelum);
    return typeof i?.id === "string" && UUID.test(i.id) && sebelum ? [{ id: i.id, sebelum }] : [];
  });
  if (!items.length) return NextResponse.json({ error: "Tidak ada yang bisa diurungkan." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  let n = 0;
  for (const i of items) if (await urungkanSimpan(supabase, i.id, i.sebelum)) n++;
  return NextResponse.json({ n });
}
