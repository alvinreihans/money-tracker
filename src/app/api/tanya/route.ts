import { NextRequest, NextResponse } from "next/server";
import { isoLokal } from "@/lib/format";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { jawabTanya } from "@/lib/tanya-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pertanyaan bertahap (ambil data → hitung → jawab) bisa 20–30 detik di
// Gemini; batas fungsi Vercel Hobby 60 detik.
export const maxDuration = 60;

const MAKS_PERTANYAAN = 300;
const BATAS_WAKTU_MS = 55_000;

const SIBUK = "Lagi sibuk, coba lagi sebentar ya.";

/**
 * Tanya AI di Analitik (SPEC-analitik-ai). Intinya di jawabTanya()
 * (src/lib/tanya-server.ts); di sini hanya login, validasi, dan batas waktu.
 * Tidak menyimpan apa pun.
 *
 * Balasan: { jawaban, tautan: [{label, href}], ragu }.
 */
export async function POST(req: NextRequest) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { pertanyaan?: unknown; riwayat?: unknown; bulan?: unknown } | null;
  const pertanyaan = typeof body?.pertanyaan === "string" ? body.pertanyaan.trim() : "";
  if (!pertanyaan) return NextResponse.json({ error: "Pertanyaannya masih kosong." }, { status: 400 });
  if (pertanyaan.length > MAKS_PERTANYAAN) return NextResponse.json({ error: `Maksimal ${MAKS_PERTANYAAN} karakter ya.` }, { status: 400 });

  const hariIni = isoLokal(new Date());
  const bulan = typeof body?.bulan === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.bulan) ? body.bulan : hariIni.slice(0, 7);

  try {
    const kerja = jawabTanya({ supabase: await createSupabaseServerClient(), pertanyaan, riwayatMentah: body?.riwayat, bulan, hariIni });
    const waktuHabis = new Promise<never>((_, gagal) => setTimeout(() => gagal(new Error("waktu habis")), BATAS_WAKTU_MS));
    return NextResponse.json(await Promise.race([kerja, waktuHabis]));
  } catch (err) {
    console.error("tanya:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: SIBUK }, { status: 503 });
  }
}
