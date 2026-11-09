import { NextRequest, NextResponse } from "next/server";
import { barisAlir, TIPE_ALIR, type PeristiwaAlir } from "@/lib/alir";
import { isoLokal } from "@/lib/format";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { jawabTanya, MAKS_PERTANYAAN, type HasilTanya } from "@/lib/tanya-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Batas fungsi Vercel Hobby 60 detik. Asisten berhenti sendiri di ±50 detik
// (jawaban sebagian + Lanjutkan), dan route ini memotong di 55 detik.
export const maxDuration = 60;

const BATAS_WAKTU_MS = 55_000;
/** Waktu untuk asisten sebelum ia harus menjawab dengan yang sudah ditemukan. */
const WAKTU_AGEN_MS = 50_000;

const SIBUK = "Lagi sibuk, coba lagi sebentar ya.";

/**
 * Tanya AI (SPEC-analitik-ai, SPEC-asisten-agen). Intinya di jawabTanya()
 * (src/lib/tanya-server.ts); di sini hanya login, validasi, batas waktu, dan
 * aliran. Obrolan tidak disimpan; yang ditulis hanya hitungan pemakaian model
 * besar (pemakaian_ai).
 *
 * Masukan: { pertanyaan (≤ 1.000 karakter), riwayat?: [{peran, teks}] (≤ 20), bulan?: "YYYY-MM", berat?: boolean }.
 * Balasan HasilTanya: { jawaban, tautan: [{label, href}], ragu, nominal_ragu?, usulan?, model, catatan?, lanjutkan? }.
 * - `Accept: application/x-ndjson` → aliran NDJSON (src/lib/alir.ts):
 *   {t:"langkah",teks}* lalu {t:"jawaban",isi:HasilTanya} atau {t:"galat",error}.
 * - selain itu → JSON HasilTanya (atau {error} dengan status 4xx/503).
 */
export async function POST(req: NextRequest) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { pertanyaan?: unknown; riwayat?: unknown; bulan?: unknown; berat?: unknown } | null;
  const pertanyaan = typeof body?.pertanyaan === "string" ? body.pertanyaan.trim() : "";
  if (!pertanyaan) return NextResponse.json({ error: "Pertanyaannya masih kosong." }, { status: 400 });
  if (pertanyaan.length > MAKS_PERTANYAAN) return NextResponse.json({ error: `Maksimal ${MAKS_PERTANYAAN.toLocaleString("id-ID")} karakter ya.` }, { status: 400 });

  const hariIni = isoLokal(new Date());
  const bulan = typeof body?.bulan === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.bulan) ? body.bulan : hariIni.slice(0, 7);
  const mulai = Date.now();
  const supabase = await createSupabaseServerClient();

  const kerjakan = (langkah?: (teks: string) => void): Promise<HasilTanya> => {
    const kerja = jawabTanya({ supabase, pertanyaan, riwayatMentah: body?.riwayat, bulan, hariIni, sudahBerat: body?.berat === true, batasWaktu: mulai + WAKTU_AGEN_MS, langkah });
    const waktuHabis = new Promise<never>((_, gagal) => setTimeout(() => gagal(new Error("waktu habis")), BATAS_WAKTU_MS - (Date.now() - mulai)));
    return Promise.race([kerja, waktuHabis]);
  };

  if (!(req.headers.get("accept") ?? "").includes(TIPE_ALIR)) {
    try {
      return NextResponse.json(await kerjakan());
    } catch (err) {
      console.error("tanya:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: SIBUK }, { status: 503 });
    }
  }

  const enc = new TextEncoder();
  const aliran = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let tutup = false;
      const kirim = (p: PeristiwaAlir) => {
        if (!tutup) ctrl.enqueue(enc.encode(barisAlir(p)));
      };
      try {
        const hasil = await kerjakan((teks) => kirim({ t: "langkah", teks }));
        kirim({ t: "jawaban", isi: hasil });
      } catch (err) {
        console.error("tanya:", err instanceof Error ? err.message : err);
        kirim({ t: "galat", error: SIBUK });
      } finally {
        tutup = true;
        ctrl.close();
      }
    },
  });
  return new Response(aliran, { headers: { "content-type": `${TIPE_ALIR}; charset=utf-8`, "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
