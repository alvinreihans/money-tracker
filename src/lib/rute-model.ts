/**
 * Pemilihan model Tanya AI (SPEC-asisten-agen §1, lapis 1): aturan di kode,
 * tanpa panggilan AI. Pertanyaan berat langsung ke model besar
 * (GEMINI_MODEL_BERAT); selain itu mulai di Flash-Lite, yang boleh
 * menyerahkan (lapis 2, di src/lib/agen.ts). Fungsi murni — diuji di
 * scripts/uji-agen.mts.
 *
 * Kuota model besar kecil (puluhan permintaan per hari), jadi aturannya
 * sengaja sempit: pertanyaan "kenapa boros/naik" tentang pengeluaran sebulan
 * dijawab dari ringkasan bulan yang sudah dihitung, tetap di Flash-Lite.
 */

export type JenisModel = "ringan" | "berat";

export interface PilihanModel {
  model: JenisModel;
  /** Aturan yang membuatnya berat; null = ringan. */
  alasan: "lanjutan" | "ubah" | "penyebab" | "banding" | "rentang" | null;
}

// Meminta perubahan data (lebih-lebih banyak sekaligus).
const UBAH =
  /\b(rapi(kan|hin|in)|rapih(kan|in)|beres(kan|in)|benerin semua|perbaiki semua|betulkan semua|ubah semua|ganti semua|pindahkan semua|jadikan semua|gabung(kan|in)?|hapus(kan|in)? (yang |transaksi )?(dobel|ganda|kembar|duplikat)|buat(kan|in)? kantong|bikin(in)? kantong|tambah(kan|in)? kantong)\b/i;

// Mencari penyebab masalah data/saldo (bukan "kenapa boros").
const PENYEBAB =
  /\b(beda|selisih|ga sama|gak sama|nggak sama|tidak sama|ngga sama|tidak cocok|gak cocok|ga cocok|nggak cocok)\b[^.?!]{0,40}\b(bank|m-?banking|rekening( koran)?|aplikasi|saldo|dana|gopay|ovo|shopeepay|seabank|jago|bri|bca|bni|mandiri)\b|\b(dobel|double|ganda|kembar|duplikat|hilang|kelewat|terlewat|nyasar|ketinggalan)\b|\bsaldo\b[^.?!]{0,40}\b(salah|aneh|minus|kurang|lebih|ga bener|nggak bener|tidak benar)\b/i;

// "kenapa/kok" + topik data (bukan pengeluaran bulanan).
const KENAPA_DATA = /\b(kenapa|mengapa|kok)\b[^.?!]{0,60}\b(saldo|tercatat|dicatat|masuk ke|jadi pengeluaran|jadi pemasukan|pindah kantong|rekening koran|impor|kantong)\b/i;

// Membandingkan beberapa kantong.
const BANDING_KANTONG = /\b(banding(kan|in)?|vs|versus)\b[^.?!]{0,60}\b(semua kantong|antar ?kantong|kantong-kantong|tiap kantong|setiap kantong|per kantong)\b/i;

// Rentang waktu panjang: lebih dari 3 bulan, dari awal, setahun.
const RENTANG = /\b(dari awal|sejak awal|semua waktu|sepanjang waktu|selama ini|setahun|satu tahun|1 tahun|tahun ini|tahun lalu|per bulan sepanjang|tiap bulan sepanjang)\b/i;
const N_BULAN = /\b(\d{1,2}|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|dua belas)\s+bulan\b/i;
const ANGKA_KATA: Record<string, number> = { empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, "dua belas": 12 };

export function pilihModelAwal(pertanyaan: string, { sudahBerat = false }: { sudahBerat?: boolean } = {}): PilihanModel {
  const q = pertanyaan.replace(/\s+/g, " ").trim();
  if (sudahBerat) return { model: "berat", alasan: "lanjutan" };
  if (UBAH.test(q)) return { model: "berat", alasan: "ubah" };
  if (PENYEBAB.test(q) || KENAPA_DATA.test(q)) return { model: "berat", alasan: "penyebab" };
  if (BANDING_KANTONG.test(q)) return { model: "berat", alasan: "banding" };
  const n = q.match(N_BULAN)?.[1]?.toLowerCase();
  const bulan = n ? (ANGKA_KATA[n] ?? Number(n)) : 0;
  if (RENTANG.test(q) || bulan > 3) return { model: "berat", alasan: "rentang" };
  return { model: "ringan", alasan: null };
}

/** Galat kuota/429 dari Gemini (SDK @google/generative-ai: status 429 atau pesan RESOURCE_EXHAUSTED/quota). */
export function galatKuota(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; message?: string };
  return e.status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(e.message ?? "");
}

/** Catatan di bawah jawaban saat kuota model besar habis (P8: satu-satunya tanda model). */
export const CATATAN_KUOTA = "Dijawab model ringan, kuota model besar hari ini habis.";
