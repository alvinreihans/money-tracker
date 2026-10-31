import { cocokkanKantong, type Kantong } from "@/lib/kantong";

/**
 * Arah bukti transfer antar dua pihak (SPEC-catat-tuntas): AI hanya membaca
 * nama & bank pengirim dan penerima; arahnya diputuskan di sini — dari nama
 * user yang sudah dikenal, lalu dari kantong user, lalu (kalau masih ragu)
 * ditanyakan. Tanpa ini, bukti transfer kiriman orang lain tercatat sebagai
 * pengeluaran.
 */

export interface PihakTransfer {
  nama: string | null;
  bank: string | null;
}
export interface BuktiTransfer {
  pengirim: PihakTransfer;
  penerima: PihakTransfer;
}
export type Arah = "masuk" | "keluar" | "pindah";

/** Nama user yang disimpan paling banyak segini. */
export const MAKS_NAMA = 5;

const GELAR = new Set(["bapak", "bpk", "pak", "ibu", "bu", "sdr", "sdri", "tuan", "nyonya", "ny", "nn", "h", "hj", "dr", "ir", "drs", "dra", "prof"]);

/** Kata-kata nama: huruf kecil, tanpa gelar & tanda baca; "*" (nama tersamar) dipertahankan. */
function kataNama(nama: string): string[] {
  return nama
    .toLowerCase()
    .replace(/[^a-z*\s]/g, " ")
    .split(/\s+/)
    .filter((k) => k && !GELAR.has(k));
}

/** Satu kata cocok: sama persis, atau awalannya untuk inisial ("R") & tersamar ("REI***"). */
function kataCocok(a: string, b: string): boolean {
  const awalan = (k: string) => (k.includes("*") ? k.slice(0, k.indexOf("*")) : k.length === 1 ? k : null);
  const pa = awalan(a);
  const pb = awalan(b);
  if (pa === null && pb === null) return a === b;
  if (pa !== null && pb !== null) return pa.startsWith(pb) || pb.startsWith(pa);
  return pa !== null ? b.startsWith(pa) : a.startsWith(pb!);
}

/**
 * Dua nama orang yang sama: semua kata nama yang lebih pendek ada di nama
 * yang lebih panjang — minimal 2 kata, kecuali namanya memang satu kata.
 * Kata yang tersamar seluruhnya ("***") tidak dihitung.
 */
export function namaSama(a: string, b: string): boolean {
  const ka = kataNama(a).filter((k) => !/^\*+$/.test(k));
  const kb = kataNama(b).filter((k) => !/^\*+$/.test(k));
  const [pendek, panjang] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  if (!pendek.length) return false;
  if (pendek.length < 2 && panjang.length > 1) return false;
  const sisa = [...panjang];
  return pendek.every((k) => {
    const i = sisa.findIndex((x) => kataCocok(k, x));
    if (i < 0) return false;
    sisa.splice(i, 1);
    return true;
  });
}

/** Kantong dari nama bank di bukti ("BANK SEABANK INDONESIA" → SeaBank). */
export function kantongBank<K extends Pick<Kantong, "name"> & Partial<Pick<Kantong, "aliases">>>(bank: string | null, daftar: K[]): K | null {
  if (!bank) return null;
  const ringkas = bank.replace(/^\s*bank\s+/i, "").replace(/\s+(indonesia|tbk|persero)\b.*$/i, "");
  return cocokkanKantong(bank, daftar) ?? cocokkanKantong(ringkas, daftar);
}

/**
 * Arah transaksi, atau null kalau harus ditanyakan. Urutannya: nama user
 * (pengirim/penerima), lalu kantong (bank penerima saja yang milik user →
 * masuk; bank pengirim saja → keluar).
 */
export function tentukanArah<K extends Pick<Kantong, "name"> & Partial<Pick<Kantong, "aliases">>>(bukti: BuktiTransfer, namaUser: string[], kantong: K[]): Arah | null {
  const milikUser = (nama: string | null) => Boolean(nama) && namaUser.some((n) => namaSama(n, nama!));
  const kirim = milikUser(bukti.pengirim.nama);
  const terima = milikUser(bukti.penerima.nama);
  if (kirim && terima) return "pindah";
  if (terima) return "masuk";
  if (kirim) return "keluar";
  const dari = kantongBank(bukti.pengirim.bank, kantong);
  const ke = kantongBank(bukti.penerima.bank, kantong);
  if (ke && !dari) return "masuk";
  if (dari && !ke) return "keluar";
  return null;
}

/** "DEWI LESTARI" → "Dewi Lestari". */
export function rapikanNama(nama: string | null): string | null {
  const n = nama?.trim().replace(/\s+/g, " ");
  if (!n) return null;
  return n === n.toUpperCase() ? n.toLowerCase().replace(/(^|\s)\S/g, (h) => h.toUpperCase()) : n;
}

/**
 * Isian transaksi untuk arah itu. Kantongnya dicocokkan pemanggil dari
 * `payment_method` (dan `payment_target` untuk pindah kantong).
 */
export function isianArah(bukti: BuktiTransfer, arah: Arah) {
  if (arah === "masuk") {
    return { type: "income" as const, category: "other", merchant: rapikanNama(bukti.pengirim.nama), payment_method: bukti.penerima.bank, payment_target: null };
  }
  if (arah === "keluar") {
    return { type: "expense" as const, merchant: rapikanNama(bukti.penerima.nama), payment_method: bukti.pengirim.bank, payment_target: null };
  }
  return { type: "transfer" as const, category: "other", merchant: null, payment_method: bukti.pengirim.bank, payment_target: bukti.penerima.bank };
}

/** Nama user yang dipelajari dari jawabannya. */
export function namaDariJawaban(bukti: BuktiTransfer, arah: Arah): string[] {
  const n = arah === "masuk" ? [bukti.penerima.nama] : arah === "keluar" ? [bukti.pengirim.nama] : [bukti.pengirim.nama, bukti.penerima.nama];
  return n.flatMap((x) => (x?.trim() ? [rapikanNama(x)!] : []));
}

/** Gabungkan nama baru ke daftar tersimpan: tanpa yang sudah sama, paling baru di depan, maks 5. */
export function gabungNama(lama: string[], baru: string[]): string[] {
  const hasil = [...lama];
  for (const n of baru) if (!hasil.some((x) => namaSama(x, n))) hasil.unshift(n);
  return hasil.slice(0, MAKS_NAMA);
}

/** Jawaban ketik/chip: "aku terima", "kirim", "pindah antar rekeningku". */
export function bacaArah(teks: string): Arah | null {
  const t = teks.toLowerCase();
  if (/pindah|rekening\s*(ku|sendiri)|antar/.test(t)) return "pindah";
  if (/terima|masuk|dapat|dapet|dikirim(in)? ke aku/.test(t)) return "masuk";
  if (/kirim|keluar|bayar|transfer ke/.test(t)) return "keluar";
  return null;
}

/** Pertanyaannya: "Ini kamu yang kirim ke Rina, atau terima dari Dewi?" */
export function kalimatArah(bukti: BuktiTransfer): string {
  const depan = (n: string | null) => rapikanNama(n)?.split(" ")[0];
  const ke = depan(bukti.penerima.nama);
  const dari = depan(bukti.pengirim.nama);
  return ke && dari ? `Ini kamu yang kirim ke ${ke}, atau terima dari ${dari}?` : "Ini uang keluar atau masuk?";
}

/** Bukti transfer dari kolom database (JSON) — null kalau kosong/rusak. */
export function bacaBukti(nilai: unknown): BuktiTransfer | null {
  if (!nilai) return null;
  try {
    const b = (typeof nilai === "string" ? JSON.parse(nilai) : nilai) as BuktiTransfer;
    return b?.pengirim && b?.penerima ? b : null;
  } catch {
    return null;
  }
}
