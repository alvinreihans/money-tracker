import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKonteksAI } from "@/lib/kategori-server";
import { bacaNominal, kantongDariJawaban, pertanyaanDraft, type JenisTanya } from "@/lib/draft";
import { processReceiptText } from "@/lib/receipt";
import { TEKS_MAKS } from "@/lib/transaksi-input";
import type { Kantong } from "@/lib/kantong";
import { bacaJam, jamTransaksi, perluTanyaJam, saldoSejak } from "@/lib/waktu";
import type { Transaction } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// "cerita" membaca ulang lewat rantai Groq.
export const maxDuration = 30;

const JENIS: JenisTanya[] = ["cerita", "nominal", "kantong", "kantong_tujuan", "waktu", "konfirmasi"];

/**
 * Jawaban user untuk pertanyaan di percakapan sebuah draft (SPEC-catat-chat).
 * Jawaban mengisi draft; begitu tidak ada yang kurang, draft dikonfirmasi
 * (ikut dihitung) dan percakapan + fotonya hilang lewat trigger database.
 *
 * Balasan: { transaction, pertanyaan } — pertanyaan null = selesai.
 * 422 = jawaban tidak bisa dipakai; pertanyaannya tetap terbuka.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { jenis?: unknown; nilai?: unknown } | null;
  const jenis = JENIS.find((j) => j === body?.jenis);
  const nilai = typeof body?.nilai === "string" ? body.nilai.trim().slice(0, TEKS_MAKS) : "";
  if (!jenis) return NextResponse.json({ error: "Jenis jawaban tidak dikenal." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("transactions").select("*").eq("id", id).eq("status", "needs_review").maybeSingle();
  const tx = data as Transaction | null;
  if (!tx) return NextResponse.json({ error: "Catatan ini sudah selesai atau sudah dihapus." }, { status: 404 });

  const { data: daftarKantong } = await supabase.from("user_accounts").select("id, name, kind, aliases, saldo_per, saldo_sejak");
  const semua = (daftarKantong ?? []) as Pick<Kantong, "id" | "name" | "kind" | "aliases" | "saldo_per" | "saldo_sejak">[];
  const saldoDari = (id: string) => {
    const k = semua.find((x) => x.id === id);
    return k ? saldoSejak(k) : undefined;
  };
  // Jam masih perlu ditanyakan untuk tanggal & jam ini? (hari saldo kantongnya)
  const masihRagu = (t: Pick<Transaction, "transaction_date" | "kantong_id" | "kantong_tujuan_id">, waktu: string | null, perkiraan: boolean) =>
    [t.kantong_id, t.kantong_tujuan_id].some((kid) => kid && perluTanyaJam({ transaction_date: t.transaction_date, waktu, perkiraan }, saldoDari(kid)));
  // Orang (Lend & Borrow) hanya lewat pindah kantong, seperti di simpanTransaksi.
  const pilihan = (type: string) => (type === "transfer" ? semua : semua.filter((k) => k.kind !== "orang"));
  const tolak = (error: string) => NextResponse.json({ error }, { status: 422 });

  const patch: Partial<Transaction> = {};
  // Ketikan yang bukan jawaban langsung ("nominalnya 40rb", "pakai yang biru")
  // dibaca AI seperti cerita; kalau tetap tidak ada yang berubah, baru ditolak.
  let gagal: string | null = null;
  if (jenis === "nominal") {
    const n = bacaNominal(nilai);
    if (n) patch.amount = n;
    else gagal = "Angkanya belum kebaca. Coba ketik lagi, mis. 150.000";
  } else if (jenis === "kantong") {
    const k = kantongDariJawaban(nilai, pilihan(tx.type));
    if (k) Object.assign(patch, { kantong_id: k.id, payment_method: k.name });
    else gagal = "Kantong itu belum ada. Pilih salah satu ya.";
  } else if (jenis === "kantong_tujuan") {
    const k = kantongDariJawaban(nilai, semua);
    if (k && k.id !== tx.kantong_id) patch.kantong_tujuan_id = k.id;
    else gagal = "Pilih kantong tujuan yang lain ya.";
  } else if (jenis === "waktu") {
    const b = bacaJam(nilai);
    // "siang" padahal saldo diisi jam 14.00: masih bisa sebelum atau sesudah.
    // Langsung ditanya lagi — bukan dibaca AI, yang bisa mengarang jam pasti.
    if (b && masihRagu(tx, b.jam, b.perkiraan)) return tolak("Kira-kira jam berapa? Mis. “jam 13” atau “13.30”.");
    if (b) patch.waktu = b.jam;
    else gagal = "Jamnya belum kebaca. Coba mis. “jam 10” atau “10.30”.";
  }
  if (jenis === "cerita" || (gagal && nilai)) {
    if (!nilai) return tolak("Ceritain sedikit transaksinya ya.");
    // Digabung dengan teks/OCR sebelumnya, tapi ditandai jelas sebagai
    // penjelasan user: kalau ditempel begitu saja, model menganggapnya bagian
    // struk dan lebih percaya "TOTAL ??" dari OCR yang rusak.
    const gabung = tx.raw_ocr_text
      ? `${tx.raw_ocr_text}\n\n---\nPenjelasan dari pengguna (utamakan ini untuk semua isian, termasuk nominal): ${nilai}`
      : nilai;
    const hasil = await processReceiptText(gabung, await ambilKonteksAI(supabase));
    const e = hasil.extracted;
    patch.raw_ocr_text = gabung;
    if (e && e.amount > 0) {
      Object.assign(patch, {
        amount: e.amount,
        type: e.type === "transfer" && !semua.length ? "expense" : e.type,
        category: e.category,
        merchant: e.merchant ?? tx.merchant,
        description: e.description ?? tx.description,
        transaction_date: e.transaction_date,
      });
    }
    // ponytail: pinjaman/cicilan dari cerita tidak ditautkan (jarang); kalau perlu, pakai simpanTransaksi.
    const type = (patch.type as string | undefined) ?? tx.type;
    const k = e?.payment_method ? kantongDariJawaban(e.payment_method, pilihan(type)) : null;
    if (k) Object.assign(patch, { kantong_id: k.id, payment_method: k.name });
    const t = type === "transfer" && e?.payment_target ? kantongDariJawaban(e.payment_target, semua) : null;
    if (t && t.id !== (k?.id ?? tx.kantong_id)) patch.kantong_tujuan_id = t.id;
    // Jam dari cerita ("tadi jam 10 beli roti"); yang masih ragu ditanya berikutnya.
    if (e && (e.time || e.time_hint)) {
      const j = jamTransaksi({ time: e.time, hint: e.time_hint }, patch.transaction_date ?? tx.transaction_date);
      patch.waktu = masihRagu({ ...tx, ...patch }, j.waktu, j.perkiraan) ? null : j.waktu;
    }
    // "13:57:00" dari database = "13:57"; "15680.00" = 15680.
    const teks = (x: unknown) => String(x ?? "").replace(/^(\d\d:\d\d):00$/, "$1");
    const sama = (a: unknown, b: unknown) => teks(a) === teks(b) || (a != null && b != null && Number(a) === Number(b));
    const PENTING = ["amount", "type", "transaction_date", "waktu", "kantong_id", "kantong_tujuan_id"] as const;
    if (gagal && PENTING.every((k) => !(k in patch) || sama(patch[k], tx[k]))) return tolak(gagal);
  } else if (gagal) return tolak(gagal);

  // Setelah dijawab, "konfirmasi" berarti tidak ada yang kurang lagi: langsung
  // dikonfirmasi. Pertanyaan konfirmasi hanya diajukan saat draft dibuka.
  const sesudah = pertanyaanDraft({ ...tx, ...patch }, saldoDari);
  const selesai = sesudah === null || sesudah === "konfirmasi";
  if (selesai) Object.assign(patch, { status: "confirmed", raw_ocr_text: null });

  const { data: baru, error } = await supabase.from("transactions").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Gagal menyimpan jawabannya." }, { status: 500 });

  // Biaya admin / cashback mengikuti induknya: ikut dihitung, dari kantong yang sama.
  if (selesai) {
    const t = baru as Transaction;
    await supabase
      .from("transactions")
      .update({ status: "confirmed", kantong_id: t.kantong_id, payment_method: t.payment_method })
      .eq("induk_id", id);
  }

  return NextResponse.json({ transaction: baru as Transaction, pertanyaan: selesai ? null : sesudah });
}
