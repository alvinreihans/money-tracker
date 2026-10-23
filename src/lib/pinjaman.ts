import { normal } from "@/lib/kantong";

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

export interface RingkasBeranda {
  totalLend: number;
  totalBorrow: number;
  orangLend: number;
  orangBorrow: number;
  /** Cicilan yang jatuh tempo sampai akhir bulan ini (termasuk yang telat) dan belum dibayar. */
  cicilanBulanIni: { jumlah: number; total: number };
  /** Jatuh tempo terdekat yang belum beres: pinjaman orang atau cicilan. */
  terdekat: { nama: string; tanggal: string; telat: boolean } | null;
  /** Ada apa pun untuk ditampilkan. */
  ada: boolean;
}

/** Ringkasan untuk kartu "Lend & Borrow" di Beranda. */
export function ringkasBeranda(
  kantong: { kind: string; saldo: number; name: string; jatuh_tempo?: string | null }[],
  cicilan: Pick<Cicilan, "id" | "nama" | "tenor" | "jatuh_tempo_awal" | "nominal">[],
  dibayar: Record<string, number[]>,
  hariIni: string,
): RingkasBeranda {
  const r = ringkasanPinjaman(kantong);
  const akhirBulan = jatuhTempoKe(`${hariIni.slice(0, 7)}-31`, 1);
  const tenggat: { nama: string; tanggal: string }[] = [];
  let jumlah = 0;
  let total = 0;

  for (const c of cicilan) {
    const st = statusCicilan(c, dibayar[c.id] ?? [], hariIni);
    if (!st.berikutnya) continue;
    tenggat.push({ nama: c.nama, tanggal: st.berikutnya.jatuhTempo });
    for (const a of jadwalCicilan(c, dibayar[c.id] ?? [])) {
      if (!a.dibayar && a.jatuhTempo <= akhirBulan) {
        jumlah++;
        total += Number(c.nominal);
      }
    }
  }
  for (const x of [...r.lend, ...r.borrow]) {
    if (x.kantong.jatuh_tempo) tenggat.push({ nama: x.kantong.name, tanggal: x.kantong.jatuh_tempo });
  }

  const terdekat = tenggat.sort((a, b) => a.tanggal.localeCompare(b.tanggal))[0] ?? null;
  return {
    totalLend: r.totalLend,
    totalBorrow: r.totalBorrow,
    orangLend: r.lend.length,
    orangBorrow: r.borrow.length,
    cicilanBulanIni: { jumlah, total },
    terdekat: terdekat ? { ...terdekat, telat: terdekat.tanggal < hariIni } : null,
    ada: r.lend.length + r.borrow.length + tenggat.length > 0,
  };
}

/**
 * Rencana cicilan yang dimaksud teks ("bayar cicilan spaylater" → AI menyebut
 * "Shopee PayLater"): cocok persis dengan nama barang atau penyedianya (tanpa
 * beda huruf/spasi). Dari yang cocok & belum lunas, yang jatuh tempo
 * berikutnya paling awal; beserta nomor cicilan yang dibayar. Null kalau tidak
 * ada yang cocok.
 */
export function pilihCicilan<R extends Pick<Cicilan, "id" | "nama" | "penyedia" | "tenor" | "jatuh_tempo_awal" | "nominal">>(
  sebutan: string,
  rencana: R[],
  dibayar: Record<string, number[]>,
  hariIni: string,
): { rencana: R; ke: number } | null {
  const cari = normal(sebutan);
  if (!cari) return null;
  const kandidat = rencana
    .filter((r) => [r.nama, r.penyedia].some((n) => n && normal(n) === cari))
    .map((r) => ({ r, berikutnya: statusCicilan(r, dibayar[r.id] ?? [], hariIni).berikutnya }))
    .filter((x) => x.berikutnya)
    .sort((a, b) => a.berikutnya!.jatuhTempo.localeCompare(b.berikutnya!.jatuhTempo));
  return kandidat[0] ? { rencana: kandidat[0].r, ke: kandidat[0].berikutnya!.ke } : null;
}

/** Isian paylater yang terbaca dari struk/ketikan (SPEC-paylater). */
export interface InfoPaylater {
  penyedia: string;
  tenor: number | null;
  per_cicilan: number | null;
  /** "YYYY-MM-DD" */
  jatuh_tempo: string | null;
}

/**
 * Rencana cicilan dari belanja paylater. Per cicilan: yang tertera, atau
 * total dibagi rata (dibulatkan ke atas). Jatuh tempo pertama: yang tertera,
 * atau tanggal yang sama bulan depan.
 */
export function rencanaPaylater(
  belanja: { amount: number | string; merchant: string | null; category: string; transaction_date: string },
  info: InfoPaylater & { tenor: number },
): Pick<Cicilan, "nama" | "penyedia" | "category" | "nominal" | "tenor" | "jatuh_tempo_awal"> {
  return {
    nama: (belanja.merchant || `Belanja ${info.penyedia}`).slice(0, 60),
    penyedia: info.penyedia,
    category: belanja.category,
    nominal: info.per_cicilan && info.per_cicilan > 0 ? info.per_cicilan : Math.ceil(Number(belanja.amount) / info.tenor),
    tenor: info.tenor,
    jatuh_tempo_awal: info.jatuh_tempo && info.jatuh_tempo >= belanja.transaction_date ? info.jatuh_tempo : jatuhTempoKe(belanja.transaction_date, 2),
  };
}

/** Bayar beberapa cicilan sekaligus: total dibagi rata, sisa pembulatan di cicilan terakhir. */
export function bagiRata(total: number, jumlah: number): number[] {
  const per = Math.floor(total / jumlah);
  return Array.from({ length: jumlah }, (_, i) => (i === jumlah - 1 ? total - per * (jumlah - 1) : per));
}
