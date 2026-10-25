import { cocokkanKantong, type Kantong } from "@/lib/kantong";
import { perluTanyaJam, type SaldoSejak } from "@/lib/waktu";

/**
 * Catat sebagai obrolan (SPEC-catat-chat.md): apa yang masih kurang dari
 * sebuah draft, dan membaca jawaban user. Fungsi murni — diuji di
 * scripts/uji-draft.mts.
 */

export type JenisTanya = "cerita" | "nominal" | "arah" | "kantong" | "kantong_tujuan" | "waktu" | "tenor" | "duplikat" | "konfirmasi";

interface BarisDraft {
  status: string;
  amount: number | string;
  type: string;
  category: string;
  merchant: string | null;
  kantong_id: string | null;
  kantong_tujuan_id: string | null;
  transaction_date?: string;
  waktu?: string | null;
  /** Belanja paylater yang menunggu berapa kali cicilannya (SPEC-paylater). */
  paylater?: string | null;
  /** Transaksi tercatat yang sama persis (SPEC-catat-andal): ditanya "Catat lagi?". */
  duplikat_dari?: string | null;
  /** Bukti transfer yang arahnya belum dipastikan (SPEC-catat-tuntas). */
  bukti_transfer?: string | null;
}

/**
 * Pertanyaan berikutnya untuk sebuah draft, satu per satu ("satu pilihan,
 * satu tugas"): nominal dulu, lalu kantong, lalu kantong tujuan, lalu jam
 * (hanya di hari saldo kantongnya, kalau jamnya belum diketahui —
 * SPEC-saldo-waktu). Tidak terbaca sama sekali → minta diceritakan. Semua
 * sudah ada tapi masih draft (mis. hasil AI dianggap tidak valid) → minta
 * konfirmasi. Null kalau bukan draft.
 *
 * `saldoDari`: saldo sejak kapan untuk tiap kantong (id) — tanpa ini jam
 * tidak pernah ditanyakan.
 */
export function pertanyaanDraft(t: BarisDraft, saldoDari?: (id: string) => SaldoSejak | undefined): JenisTanya | null {
  if (t.status !== "needs_review") return null;
  if (!(Number(t.amount) > 0)) return t.merchant || (t.category && t.category !== "other") ? "nominal" : "cerita";
  // Bukti transfer antar dua pihak: kirim atau terima dulu — kantongnya ikut arah itu.
  if (t.bukti_transfer) return "arah";
  // Paylater tidak memakai kantong: begitu tenornya dijawab, jadi rencana cicilan.
  if (t.paylater) return "tenor";
  if (!t.kantong_id) return "kantong";
  if (t.type === "transfer" && !t.kantong_tujuan_id) return "kantong_tujuan";
  if (t.transaction_date && saldoDari && !t.waktu) {
    const tx = { transaction_date: t.transaction_date, waktu: null };
    if ([t.kantong_id, t.kantong_tujuan_id].some((id) => id && perluTanyaJam(tx, saldoDari(id)))) return "waktu";
  }
  if (t.duplikat_dari) return "duplikat";
  return "konfirmasi";
}

export const KALIMAT_TANYA: Record<JenisTanya, string> = {
  cerita: "Aku belum nangkep. Ceritain transaksinya? Misalnya “bensin 150rb pakai BCA”.",
  nominal: "Berapa nominalnya?",
  // Biasanya diganti kalimatArah() yang menyebut nama kedua pihak.
  arah: "Ini uang keluar atau masuk?",
  kantong: "Pakai kantong apa?",
  kantong_tujuan: "Pindah ke kantong mana?",
  waktu: "Tadi itu jam berapa?",
  tenor: "Dicicil berapa kali?",
  duplikat: "Sepertinya ini sudah tercatat. Catat lagi?",
  konfirmasi: "Sudah benar begini?",
};

/** Setelah gagal menangkap cerita lagi. */
export const CERITA_ULANG = "Hmm, masih belum jelas. Sebut nominal & kantongnya ya.";

/** Batas putaran cerita sebelum menawarkan isi manual. */
export const MAKS_CERITA = 2;

/**
 * Nominal dari jawaban ketik: "150.000", "150rb", "1,5jt", "Rp 150.000",
 * "150k". Null kalau tidak ada angka yang masuk akal.
 */
export function bacaNominal(teks: string): number | null {
  const t = teks.toLowerCase().replace(/rp\.?\s*/g, "");
  const m = t.match(/(\d+(?:[.,]\d+)*)\s*(k|rb|ribu|jt|juta)?(?![a-z])/);
  if (!m) return null;
  let angka: number;
  const satuan = m[2];
  if (satuan) {
    // "1,5jt" / "1.5jt": koma/titik sebagai desimal; "1.500rb" jarang, anggap ribuan.
    const desimal = /^\d+[.,]\d{1,2}$/.test(m[1]);
    angka = desimal ? parseFloat(m[1].replace(",", ".")) : parseInt(m[1].replace(/[.,]/g, ""), 10);
    angka *= satuan === "jt" || satuan === "juta" ? 1_000_000 : 1_000;
  } else {
    // Tanpa satuan: titik/koma adalah pemisah ribuan ("150.000").
    angka = parseInt(m[1].replace(/[.,]/g, ""), 10);
  }
  return Number.isFinite(angka) && angka > 0 ? Math.round(angka) : null;
}

/** Pilihan tenor paylater yang umum. */
export const PILIHAN_TENOR = [1, 3, 6, 12];

/** Berapa kali cicilan dari ketikan: "3", "3x", "3 kali", "6 bulan", "sekali"/"lunas" = 1. */
export function bacaTenor(teks: string): number | null {
  const t = teks.toLowerCase().trim();
  if (/\b(sekali|lunas|langsung|bayar penuh|bulan depan|30 hari)\b/.test(t)) return 1;
  const m = t.match(/\b(\d{1,3})\s*(x|×|kali|bulan|bln)?(?![\d.,]|\s*(rb|ribu|k|jt|juta)\b)/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : null;
}

/**
 * Ketikan setelah transaksi tersimpan di obrolan: koreksi untuk transaksi itu
 * ("eh yang tadi pakai BCA", "nominalnya 25rb", "bukan makan, belanja"), atau
 * catatan baru? Koreksi biasanya dibuka dengan kata penanda; catatan baru
 * hampir tidak pernah.
 */
export function apakahKoreksi(teks: string): boolean {
  const t = teks.toLowerCase().trim();
  return (
    /^(eh|e+h,?|loh|lho|salah|bukan|ganti|ganti aja|ubah|koreksi|harusnya|maksudnya|maksud(ku|nya)|yang tadi|tadi|itu tadi|oh iya|oiya|sori|sorry)\b/.test(t) ||
    /\b(yang tadi|harusnya|bukan .+ tapi|salah (nominal|kantong|kategori|tanggal)|nominalnya|kantongnya|kategorinya|tanggalnya)\b/.test(t)
  );
}

/** Ketikan yang meminta catatannya dibuang ("hapus aja", "ga jadi", "ga usah dicatat"). */
export function mauHapus(teks: string): boolean {
  const t = teks.toLowerCase().trim();
  return (
    /^(hapus|apus|buang|batal\w*|cancel|delete)\b/.test(t) ||
    /\b(hapus|apus|buang)(in|kan)?\b.*\b(aja|saja|ini|itu|transaksi\w*|catatan\w*|yang tadi)\b/.test(t) ||
    /\b(g|ga|gak|nggak|ngga|enggak|gk|tidak|tak)\s*(jadi|usah|perlu)\b(?!.*\d)/.test(t)
  );
}

/**
 * Kantong yang dimaksud jawaban ketik: id dari chip, nama persis ("bca"),
 * atau disebut dalam kalimat ("pakai bca dong").
 */
export function kantongDariJawaban<K extends Pick<Kantong, "id" | "name" | "aliases">>(teks: string, daftar: K[]): K | null {
  const persis = daftar.find((k) => k.id === teks) ?? cocokkanKantong(teks, daftar);
  if (persis) return persis;
  const kata = teks.split(/\s+/).filter(Boolean);
  // Dua kata dulu ("bank jago", "seabank"), lalu satu kata.
  for (let n = 2; n >= 1; n--) {
    for (let i = 0; i + n <= kata.length; i++) {
      const k = cocokkanKantong(kata.slice(i, i + n).join(" "), daftar);
      if (k) return k;
    }
  }
  return null;
}
