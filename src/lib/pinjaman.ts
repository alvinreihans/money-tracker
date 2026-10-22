/**
 * Lend & Borrow dan cicilan (SPEC-lend-borrow.md). Fungsi murni — diuji di
 * scripts/uji-pinjaman.mts.
 *
 * - Pinjaman ke/dari orang = kantong berjenis "orang"; saldonya positif berarti
 *   Lend (dia utang ke aku), negatif berarti Borrow (aku utang ke dia).
 * - Kartu kredit = kantong berjenis "kredit"; saldo negatif = tagihan.
 * - Cicilan = rencana; tiap cicilan yang dibayar adalah transaksi pengeluaran
 *   dengan cicilan_id & cicilan_ke. Jadwalnya dihitung, tidak disimpan.
 */

/** Kantong berisi uang sungguhan — yang dihitung di Total aset. */
export const kantongUang = (k: { kind: string }) => k.kind !== "orang" && k.kind !== "kredit";

/** Emoji bawaan kantong orang & kartu kredit. */
export const EMOJI_ORANG = "👤";
export const EMOJI_KREDIT = "💳";

/**
 * Kantong orang & kartu kredit dibuat dengan saldo awal 0 sejak tanggal
 * paling awal, supaya pinjaman bertanggal mundur tetap ikut terhitung.
 */
export const SALDO_PER_PINJAMAN = "2000-01-01";

export interface Cicilan {
  id: string;
  nama: string;
  penyedia: string | null;
  category: string;
  nominal: number | string;
  tenor: number;
  /** "YYYY-MM-DD" */
  jatuh_tempo_awal: string;
  kantong_id: string | null;
  catatan: string | null;
}

const dua = (n: number) => String(n).padStart(2, "0");

/**
 * Jatuh tempo cicilan ke-`ke`: tanggal yang sama tiap bulan; kalau bulan itu
 * lebih pendek, mundur ke hari terakhirnya (tgl 31 → 30 Apr, 28/29 Feb).
 */
export function jatuhTempoKe(awal: string, ke: number): string {
  const [tahun, bulan, hari] = awal.split("-").map(Number);
  const idx = tahun * 12 + (bulan - 1) + (ke - 1);
  const t = Math.floor(idx / 12);
  const b = (idx % 12) + 1;
  const hariTerakhir = new Date(Date.UTC(t, b, 0)).getUTCDate();
  return `${t}-${dua(b)}-${dua(Math.min(hari, hariTerakhir))}`;
}

export interface Angsuran {
  ke: number;
  jatuhTempo: string;
  dibayar: boolean;
}

/** Jadwal lengkap: tiap cicilan, jatuh temponya, dan sudah dibayar atau belum. */
export function jadwalCicilan(c: Pick<Cicilan, "tenor" | "jatuh_tempo_awal">, dibayarKe: number[]): Angsuran[] {
  const lunas = new Set(dibayarKe);
  return Array.from({ length: c.tenor }, (_, i) => ({
    ke: i + 1,
    jatuhTempo: jatuhTempoKe(c.jatuh_tempo_awal, i + 1),
    dibayar: lunas.has(i + 1),
  }));
}

export interface StatusCicilan {
  terbayar: number;
  sisa: number;
  lunas: boolean;
  /** Cicilan belum dibayar dengan nomor terkecil (yang dibayar berikutnya). */
  berikutnya: Angsuran | null;
  /** Ada cicilan yang lewat jatuh tempo tapi belum dibayar. */
  telat: boolean;
  /** Nominal yang belum dibayar. */
  sisaNominal: number;
}

export function statusCicilan(
  c: Pick<Cicilan, "tenor" | "jatuh_tempo_awal" | "nominal">,
  dibayarKe: number[],
  hariIni: string,
): StatusCicilan {
  const jadwal = jadwalCicilan(c, dibayarKe);
  const belum = jadwal.filter((a) => !a.dibayar);
  return {
    terbayar: jadwal.length - belum.length,
    sisa: belum.length,
    lunas: belum.length === 0,
    berikutnya: belum[0] ?? null,
    telat: belum.some((a) => a.jatuhTempo < hariIni),
    sisaNominal: belum.length * Number(c.nominal),
  };
}

export interface PosisiPinjaman<K> {
  kantong: K;
  /** Selalu positif: berapa yang dia utang (Lend) atau yang aku utang (Borrow). */
  jumlah: number;
}

/**
 * Ringkasan Lend & Borrow dari kantong orang & kredit beserta saldonya.
 * Lend: orang bersaldo positif. Borrow: orang bersaldo negatif dan kartu
 * kredit bertagihan. Lunas: orang bersaldo nol. Terbesar dulu.
 */
export function ringkasanPinjaman<K extends { kind: string; saldo: number }>(daftar: K[]) {
  const urut = (a: PosisiPinjaman<K>, b: PosisiPinjaman<K>) => b.jumlah - a.jumlah;
  const lend = daftar.filter((k) => k.kind === "orang" && k.saldo > 0).map((k) => ({ kantong: k, jumlah: k.saldo })).sort(urut);
  const borrow = daftar
    .filter((k) => (k.kind === "orang" || k.kind === "kredit") && k.saldo < 0)
    .map((k) => ({ kantong: k, jumlah: -k.saldo }))
    .sort(urut);
  return {
    lend,
    borrow,
    lunas: daftar.filter((k) => k.kind === "orang" && k.saldo === 0),
    kartu: daftar.filter((k) => k.kind === "kredit"),
    totalLend: lend.reduce((t, x) => t + x.jumlah, 0),
    totalBorrow: borrow.reduce((t, x) => t + x.jumlah, 0),
  };
}

export type ArahPinjaman = "beri" | "terima_bayar" | "pinjam" | "bayar";

/**
 * Arah uang untuk satu catatan pinjaman, sebagai pindah kantong:
 *  - beri (Lend)           : kantong uang → orang
 *  - terima_bayar          : orang → kantong uang
 *  - pinjam (Borrow)       : orang/kartu → kantong uang
 *  - bayar (bayar utang)   : kantong uang → orang/kartu
 */
export function arahPindah(arah: ArahPinjaman, uang: string, pihak: string): { dari: string; ke: string } {
  return arah === "beri" || arah === "bayar" ? { dari: uang, ke: pihak } : { dari: pihak, ke: uang };
}
