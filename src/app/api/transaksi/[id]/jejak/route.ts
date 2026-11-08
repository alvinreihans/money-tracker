import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKonteksAI } from "@/lib/kategori-server";
import { hasilKirimanUlang } from "@/lib/receipt";
import { bacaanDari } from "@/lib/jejak";
import { simpanJejak } from "@/lib/jejak-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS = 5 * 1024 * 1024;

/**
 * Jejak gambar pelengkap (SPEC-periksa-dulu §4, K1): transaksi yang dilengkapi
 * dari kartu "Lengkapi transaksi ini?" — termasuk transaksi rekening koran —
 * menyimpan thumbnail gambar itu dan ringkasan hasil bacanya di "Cara dicatat".
 * FormData: file (gambar), hasil (JSON hasil baca, opsional).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > MAKS) return NextResponse.json({ error: "Gambarnya tidak bisa dipakai." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  let hasil: unknown = null;
  try {
    const h = form?.get("hasil");
    hasil = typeof h === "string" && h.length <= 20_000 ? JSON.parse(h) : null;
  } catch {
    hasil = null;
  }
  const bacaan = hasil ? bacaanDari(hasilKirimanUlang(hasil, await ambilKonteksAI(supabase)).extracted) : null;
  const ok = await simpanJejak(supabase, id, { asal: "lengkapi", bacaan, disimpan: new Date().toISOString(), cara: "lengkapi" }, { gambar: Buffer.from(await file.arrayBuffer()) });
  return ok ? NextResponse.json({ ok }) : NextResponse.json({ error: "Transaksinya tidak ditemukan." }, { status: 404 });
}
