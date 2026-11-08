/**
 * Pembersih merchant rekening koran (SPEC-kantong-sendiri C-2): kode referensi
 * tidak jadi judul, dan pembayaran GoPay lewat Jago Pay berjudul layanannya
 * ("GoPay · GO-RIDE"). Fungsi murni — diuji di scripts/uji-rekening.mts.
 */

/** Token yang tampak seperti kode referensi, bukan nama. */
const KODE = [
  /^#\S+$/, // "#RB-12345"
  /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9_./-]{10,}$/, // ≥ 10 karakter campuran angka & huruf
  /^\d{10,}$/, // nomor panjang
  /^ID-\d+$/i, // "ID-1"
];

/** Nama tanpa token kode referensi; kodenya dikembalikan (untuk keterangan). */
export function bersihkanMerchant(nama: string | null | undefined): { nama: string | null; kode: string[] } {
  if (!nama) return { nama: null, kode: [] };
  const kode: string[] = [];
  const sisa = nama
    .split(/\s+/)
    .filter(Boolean)
    .filter((k) => (KODE.some((p) => p.test(k)) ? (kode.push(k), false) : true));
  const hasil = sisa.join(" ").replace(/[\s·:,-]+$/, "").trim();
  return { nama: hasil || null, kode };
}

/** Layanan Gojek yang disebut teks ("GO-RIDE", "GoFood") → "GO-RIDE"/"GO-FOOD"; null bila tidak ada. */
export function layananGopay(teks: string | null | undefined): string | null {
  const m = teks?.match(/\bGO-?\s?(RIDE|CAR|FOOD|SEND|MART|SHOP|BOX|TIX|PULSA|BILLS|CLEAN|MED)\b/i);
  return m ? `GO-${m[1].toUpperCase()}` : null;
}

/** Kategori pengeluaran dari layanan (aturan tetap C-2); layanan lain → null (tetap Lainnya). */
export const KATEGORI_LAYANAN: Record<string, string> = {
  "GO-RIDE": "transport",
  "GO-CAR": "transport",
  "GO-FOOD": "food",
  "GO-MART": "shopping",
  "GO-SEND": "other",
};

/** Merchant "GoPay · GO-RIDE" → kategori layanannya, atau null. */
export function kategoriLayanan(merchant: string | null | undefined): string | null {
  const m = merchant?.match(/^GoPay · (GO-[A-Z]+)$/);
  return m ? (KATEGORI_LAYANAN[m[1]] ?? null) : null;
}
