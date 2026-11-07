/**
 * Simpanan (SPEC-simpanan): deposito & tabungan/pocket yang berada di dalam
 * kantong lain (induk), dan tujuan tabungan yang disimpan di kantong lain.
 * Fungsi murni — diuji di scripts/uji-simpanan.mts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtIDR } from "@/lib/format";
import { kantongDeposito } from "@/lib/kantong";

export { kantongDeposito };

export type MacamSimpanan = "tabungan" | "deposito";
export type SatuanTenor = "hari" | "bulan";
export type Perpanjangan = "sekali" | "pokok" | "pokok_bunga";

export interface Deposito {
  kantong_id: string;
  bunga_persen: number | string;
  tenor: number;
  satuan_tenor: SatuanTenor;
  pajak_persen: number | string;
  /** Pajak mengikuti pokok tiap periode (`pajakBawaan`); false = pajak_persen diubah user, tetap. */
  pajak_otomatis?: boolean;
  perpanjangan: Perpanjangan;
  selesai: boolean;
}

export interface PeriodeDeposito {
  id: string;
  deposito_id: string;
  ke: number;
  /** "YYYY-MM-DD" */
  mulai: string;
  jatuh_tempo: string;
  pokok: number | string;
  bunga_kotor: number | string;
  pajak: number | string;
  bunga_bersih: number | string;
  /** Null = belum dicek user. */
  bunga_diterima: number | string | null;
  dievaluasi_pada: string | null;
  dicairkan_awal: boolean;
  /** Ditutup dari baris rekening koran (SPEC-deposito-jatuh-tempo), bukan evaluasi di aplikasi. */
  dari_rekening?: boolean;
}

export const NAMA_PERPANJANGAN: Record<Perpanjangan, string> = {
  sekali: "Sekali saja",
  pokok: "Diperpanjang tanpa bunga",
  pokok_bunga: "Diperpanjang dengan bunga",
};

export const KET_PERPANJANGAN: Record<Perpanjangan, string> = {
  sekali: "Cair ke induk saat jatuh tempo.",
  pokok: "Pokok diperpanjang, bunganya cair ke induk.",
  pokok_bunga: "Pokok + bunga diperpanjang.",
};

/** Chip tenor di form deposito. */
export const CHIP_TENOR: { tenor: number; satuan: SatuanTenor; label: string }[] = [
  { tenor: 14, satuan: "hari", label: "14 hari" },
  { tenor: 1, satuan: "bulan", label: "1 bln" },
  { tenor: 3, satuan: "bulan", label: "3 bln" },
  { tenor: 6, satuan: "bulan", label: "6 bln" },
  { tenor: 12, satuan: "bulan", label: "12 bln" },
];

/** Pokok sampai batas ini bebas pajak bunga (PPh final). */
export const BATAS_PAJAK = 7_500_000;
export const PAJAK_BUNGA = 20;
export const pajakBawaan = (pokok: number) => (pokok > BATAS_PAJAK ? PAJAK_BUNGA : 0);

const dua = (n: number) => String(n).padStart(2, "0");

/**
 * `iso` + `n` bulan di tanggal `patokan` (bawaan: tanggal `iso`); bulan yang
 * lebih pendek mundur ke hari terakhirnya (31 Jan + 1 → 28/29 Feb, lalu 31 Mar).
 */
export function tambahBulan(iso: string, n: number, patokan?: number): string {
  const [tahun, bulan, hari] = iso.split("-").map(Number);
  const idx = tahun * 12 + (bulan - 1) + n;
  const t = Math.floor(idx / 12);
  const b = (idx % 12) + 1;
  const hariTerakhir = new Date(Date.UTC(t, b, 0)).getUTCDate();
  return `${t}-${dua(b)}-${dua(Math.min(patokan ?? hari, hariTerakhir))}`;
}

export const tambahHari = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Jumlah hari dari `a` ke `b` ("YYYY-MM-DD"). */
export const selisihHari = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Jatuh tempo satu periode. Bulan: tanggal kalender yang sama dengan awal
 * deposito (`patokan`, tanggal mulai periode ke-1), jadi perpanjangan dari
 * 28 Feb tetap kembali ke 31 Mar.
 */
export function jatuhTempoDeposito(mulai: string, tenor: number, satuan: SatuanTenor, patokan?: number): string {
  return satuan === "hari" ? tambahHari(mulai, tenor) : tambahBulan(mulai, tenor, patokan);
}

export interface Bunga {
  hari: number;
  bunga_kotor: number;
  pajak: number;
  bunga_bersih: number;
}

/** Bunga kotor = pokok × bunga % × hari sebenarnya ÷ 365; pajak = kotor × pajak %; dibulatkan ke rupiah. */
export function hitungBunga(pokok: number, bungaPersen: number, pajakPersen: number, mulai: string, jatuhTempo: string): Bunga {
  const hari = selisihHari(mulai, jatuhTempo);
  const bunga_kotor = Math.round((pokok * bungaPersen * hari) / 100 / 365);
  const pajak = Math.round((bunga_kotor * pajakPersen) / 100);
  return { hari, bunga_kotor, pajak, bunga_bersih: bunga_kotor - pajak };
}

export interface IsianPeriode extends Bunga {
  mulai: string;
  jatuh_tempo: string;
  pokok: number;
}

type AturanDeposito = Pick<Deposito, "bunga_persen" | "tenor" | "satuan_tenor" | "pajak_persen" | "pajak_otomatis">;

/** Pajak % yang berlaku untuk pokok ini: bawaan menurut pokok, kecuali diubah user. */
export const pajakBerlaku = (d: Pick<Deposito, "pajak_persen" | "pajak_otomatis">, pokok: number) =>
  d.pajak_otomatis === false ? Number(d.pajak_persen) : pajakBawaan(pokok);

/** Satu periode lengkap dari tanggal mulai & pokoknya. */
export function periodeDeposito(d: AturanDeposito, mulai: string, pokok: number, patokan?: number): IsianPeriode {
  const jatuh_tempo = jatuhTempoDeposito(mulai, d.tenor, d.satuan_tenor, patokan);
  return { mulai, jatuh_tempo, pokok, ...hitungBunga(pokok, Number(d.bunga_persen), pajakBerlaku(d, pokok), mulai, jatuh_tempo) };
}

/** Patokan tanggal kalender perpanjangan: tanggal mulai periode ke-1. */
export const patokanDeposito = (periode: Pick<PeriodeDeposito, "ke" | "mulai">[]) => {
  const pertama = periode.find((p) => p.ke === 1) ?? [...periode].sort((a, b) => a.ke - b.ke)[0];
  return pertama ? Number(pertama.mulai.slice(8, 10)) : undefined;
};

export interface HasilTutup {
  /** Deposito berakhir: seluruh saldonya pindah ke induk. */
  cair: boolean;
  /** Bunga masuk ke deposito itu sendiri (diperpanjang dengan bunga); selain itu ke induk. */
  bungaKeDeposito: boolean;
  /** Periode berikutnya (diperpanjang), atau null. */
  baru: IsianPeriode | null;
  keterangan: string;
}

export const keteranganBunga = (p: Pick<PeriodeDeposito, "ke" | "bunga_kotor" | "pajak">) =>
  `Bunga deposito ke-${p.ke} · kotor ${fmtIDR(Number(p.bunga_kotor))}, pajak ${fmtIDR(Number(p.pajak))}`;

/**
 * Evaluasi jatuh tempo dengan bunga bersih diterima `bunga`:
 * - sekali saja → cair (bunga ke induk, pokok kembali ke induk);
 * - tanpa bunga → bunga ke induk, periode baru berpokok sama;
 * - dengan bunga → bunga ke deposito, periode baru berpokok + bunga.
 * Periode baru mulai di jatuh tempo lama.
 */
export function hasilJatuhTempo(d: AturanDeposito & Pick<Deposito, "perpanjangan">, p: PeriodeDeposito, bunga: number, patokan?: number): HasilTutup {
  const keterangan = keteranganBunga(p);
  if (d.perpanjangan === "sekali") return { cair: true, bungaKeDeposito: false, baru: null, keterangan };
  const pokok = Number(p.pokok) + (d.perpanjangan === "pokok_bunga" ? bunga : 0);
  return { cair: false, bungaKeDeposito: d.perpanjangan === "pokok_bunga", baru: periodeDeposito(d, p.jatuh_tempo, pokok, patokan), keterangan };
}

/** Periode yang menunggu dicek: jatuh tempo sudah sampai, belum dievaluasi. */
export const menungguCek = (p: Pick<PeriodeDeposito, "jatuh_tempo" | "bunga_diterima" | "dicairkan_awal">, hariIni: string) =>
  p.bunga_diterima == null && !p.dicairkan_awal && p.jatuh_tempo <= hariIni;

/**
 * Periode yang ditutup dari rekening koran dan masih bisa diurungkan: periode
 * tertutup terakhir, perpanjangannya (bila ada) belum dicek.
 */
export function urungRekening<P extends Pick<PeriodeDeposito, "ke" | "bunga_diterima" | "dicairkan_awal" | "dari_rekening">>(periode: P[]): P | null {
  const tutup = periode.filter((p) => p.bunga_diterima != null || p.dicairkan_awal).sort((a, b) => b.ke - a.ke)[0];
  if (!tutup?.dari_rekening) return null;
  const sesudah = periode.filter((p) => p.ke > tutup.ke);
  return sesudah.every((p) => p.ke === tutup.ke + 1 && p.bunga_diterima == null && !p.dicairkan_awal) ? tutup : null;
}

/** Periode yang sedang berjalan (terakhir dan belum ditutup). */
export const periodeAktif = <P extends PeriodeDeposito>(periode: P[], depositoId: string): P | null =>
  periode.filter((p) => p.deposito_id === depositoId && p.bunga_diterima == null && !p.dicairkan_awal).sort((a, b) => b.ke - a.ke)[0] ?? null;

/** Tanda minus sungguhan, bukan tanda hubung. */
const bertanda = (n: number) => `${n < 0 ? "−" : "+"}${fmtIDR(Math.abs(n))}`;

/** "Bank memberi Rp 7.350, beda −Rp 47 dari perhitungan." */
export function teksSelisih(diterima: number, estimasi: number): string {
  const beda = diterima - estimasi;
  return beda === 0
    ? `Bank memberi ${fmtIDR(diterima)}, sama dengan perhitungan.`
    : `Bank memberi ${fmtIDR(diterima)}, beda ${bertanda(beda)} dari perhitungan.`;
}

const fmt = (opsi: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...opsi, timeZone: "UTC" });
/** "6 Des 2026" */
export const tglPanjang = (iso: string) => fmt({ day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
/** "6 Des" */
export const tglPendek = (iso: string) => fmt({ day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));

/** "4,5" */
export const fmtPersen = (n: number | string) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });

/** Pratinjau form: "Jatuh tempo 6 Des 2026 (30 hari) · bunga ± Rp 7.397 · pajak Rp 0 · bersih Rp 7.397". */
export const teksPratinjau = (p: IsianPeriode) =>
  `Jatuh tempo ${tglPanjang(p.jatuh_tempo)} (${p.hari} hari) · bunga ± ${fmtIDR(p.bunga_kotor)} · pajak ${fmtIDR(p.pajak)} · bersih ${fmtIDR(p.bunga_bersih)}`;

/** Keterangan baris deposito: "Deposito · 4,5%/th · jatuh tempo 6 Des", atau menunggu cek bunga. */
export function teksDeposito(d: Pick<Deposito, "bunga_persen">, p: Pick<PeriodeDeposito, "jatuh_tempo" | "bunga_diterima" | "dicairkan_awal"> | null, hariIni: string): string {
  if (p && menungguCek(p, hariIni)) return `Jatuh tempo ${tglPendek(p.jatuh_tempo)} · menunggu cek bunga`;
  return `Deposito · ${fmtPersen(d.bunga_persen)}%/th${p ? ` · jatuh tempo ${tglPendek(p.jatuh_tempo)}` : ""}`;
}

/**
 * Nama deposito untuk pengingat: "Deposito SeaBank" (nama + induk), kecuali
 * namanya sudah menyebut induknya.
 */
export const namaDeposito = (nama: string, induk: string | null | undefined) =>
  induk && !nama.toLowerCase().includes(induk.toLowerCase()) ? `${nama} ${induk}` : nama;

type KantongInduk = { id: string; name: string; kind: string; induk_id?: string | null; macam_simpanan?: string | null };

/** Tampil di dalam kantong lain: simpanan, atau tujuan yang disimpan di kantong lain. */
export const diDalam = (k: KantongInduk) => Boolean(k.induk_id) && (k.kind === "simpanan" || k.kind === "tujuan");

/** Bisa jadi induk: kantong uang biasa. */
export const bisaInduk = (k: { kind: string }) => k.kind === "bank" || k.kind === "ewallet" || k.kind === "cash";

/**
 * Label pilihan kantong: pocket menyebut induknya ("Pocket Liburan · di
 * SeaBank"); kantong lain namanya saja.
 */
export function labelKantong(k: KantongInduk, daftar: { id: string; name: string }[]): string {
  const induk = k.kind === "simpanan" && k.induk_id ? daftar.find((x) => x.id === k.induk_id) : null;
  return induk ? `${k.name} · di ${induk.name}` : k.name;
}

/** Rincian saldo induk: "Rp 500.000 + Deposito Rp 2.000.000"; lebih dari dua isi: "Rp 500.000 + 3 simpanan Rp …". */
export function rincianInduk(sendiri: number, isi: { name: string; saldo: number }[]): string | null {
  if (isi.length === 0) return null;
  if (isi.length > 2) return `${fmtIDR(sendiri)} + ${isi.length} simpanan ${fmtIDR(isi.reduce((n, k) => n + k.saldo, 0))}`;
  return [fmtIDR(sendiri), ...isi.map((k) => `${k.name} ${fmtIDR(k.saldo)}`)].join(" + ");
}

export type BarisKantong<K> = {
  k: K;
  /** Saldo kantong itu sendiri. */
  sendiri: number;
  /** Saldo gabungan: sendiri + semua simpanan & tujuan di dalamnya. */
  saldo: number;
  /** Simpanan & tujuan di dalamnya (deposito yang sudah selesai tidak). */
  isi: (K & { saldo: number })[];
  rincian: string | null;
};

/**
 * Susunan daftar kantong (Profil → Kantong, Total aset di Beranda): kantong
 * yang berada di dalam kantong lain tidak berdiri sendiri, saldonya
 * digabung ke induknya. Deposito yang sudah selesai disembunyikan. Total
 * aset tetap jumlah saldo tiap kantong, sekali saja.
 */
export function susunKantong<K extends KantongInduk>(daftar: (K & { saldo: number })[], selesai: Set<string> = new Set()): BarisKantong<K>[] {
  const ada = new Set(daftar.map((k) => k.id));
  const tampil = daftar.filter((k) => !selesai.has(k.id));
  const anak = (id: string) => tampil.filter((k) => diDalam(k) && k.induk_id === id);
  return tampil
    .filter((k) => !(diDalam(k) && ada.has(k.induk_id!)))
    .map((k) => {
      const isi = anak(k.id);
      const saldo = k.saldo + isi.reduce((n, x) => n + x.saldo, 0);
      return { k, sendiri: k.saldo, saldo, isi, rincian: rincianInduk(k.saldo, isi) };
    });
}

/**
 * Argumen RPC tutup_periode_deposito. `cair`: Cairkan sekarang (atau sekali
 * saja); selain itu hasil evaluasi jatuh tempo menurut aturan perpanjangannya.
 */
export function argumenTutup(
  d: AturanDeposito & Pick<Deposito, "perpanjangan">,
  semua: PeriodeDeposito[],
  p: PeriodeDeposito,
  bunga: number,
  cairkan: boolean,
  hariIni: string,
) {
  const h = cairkan
    ? {
        cair: true,
        baru: null,
        keterangan: hariIni < p.jatuh_tempo ? `Bunga deposito ke-${p.ke} · dicairkan sebelum jatuh tempo` : keteranganBunga(p),
      }
    : hasilJatuhTempo(d, p, bunga, patokanDeposito(semua));
  const baru = h.baru && { mulai: h.baru.mulai, jatuh_tempo: h.baru.jatuh_tempo, pokok: h.baru.pokok, bunga_kotor: h.baru.bunga_kotor, pajak: h.baru.pajak, bunga_bersih: h.baru.bunga_bersih };
  return { p_periode: p.id, p_bunga: bunga, p_cair: h.cair, p_keterangan: h.keterangan, p_baru: baru };
}

/** Deposito milik user & seluruh periodenya (RLS). */
export async function ambilDeposito(supabase: SupabaseClient): Promise<{ deposito: Deposito[]; periode: PeriodeDeposito[] }> {
  const [{ data: deposito }, { data: periode }] = await Promise.all([
    supabase.from("deposito").select("kantong_id, bunga_persen, tenor, satuan_tenor, pajak_persen, pajak_otomatis, perpanjangan, selesai"),
    supabase.from("deposito_periode").select("*").order("ke"),
  ]);
  return { deposito: (deposito ?? []) as Deposito[], periode: (periode ?? []) as PeriodeDeposito[] };
}

/** Satu deposito yang masih berjalan, siap ditampilkan (Beranda, Profil → Kantong). */
export interface InfoDeposito {
  id: string;
  name: string;
  emoji: string | null;
  /** Nama kantong induknya. */
  induk: string;
  saldo: number;
  d: Deposito;
  /** Semua periodenya, urut ke-1, ke-2, … */
  periode: PeriodeDeposito[];
}

export function infoDeposito(
  kantong: { id: string; name: string; emoji?: string | null; kind: string; induk_id?: string | null; macam_simpanan?: string | null }[],
  saldo: Map<string, number>,
  deposito: Deposito[],
  periode: PeriodeDeposito[],
): InfoDeposito[] {
  return deposito
    .filter((d) => !d.selesai)
    .flatMap((d) => {
      const k = kantong.find((x) => x.id === d.kantong_id);
      if (!k) return [];
      return [{
        id: k.id,
        name: k.name,
        emoji: k.emoji ?? null,
        induk: kantong.find((x) => x.id === k.induk_id)?.name ?? "",
        saldo: saldo.get(k.id) ?? 0,
        d,
        periode: periode.filter((p) => p.deposito_id === d.kantong_id).sort((a, b) => a.ke - b.ke),
      }];
    });
}

export type HasilDeposito =
  | { ok: true; data: { bunga_persen: number; tenor: number; satuan_tenor: SatuanTenor; pajak_persen: number; mulai: string } }
  | { ok: false; error: string; kolom: string };

/** "4,5" → 4.5; kosong → NaN. */
export const bacaPersen = (teks: string) => (teks.trim() ? Number(teks.trim().replace(",", ".")) : NaN);

/** Isian deposito: bunga 0–25 %/th, tenor ≥ 1 (hari ≤ 3660, bulan ≤ 120), tanggal mulai, pajak 0–100 %. */
export function validasiDeposito(i: { bunga: string; tenor: string; satuan: SatuanTenor; mulai: string; pajak: string }): HasilDeposito {
  const bunga = bacaPersen(i.bunga);
  if (!(bunga > 0)) return { ok: false, error: "Bunganya diisi dulu, mis. 4,5.", kolom: "bunga" };
  if (bunga > 25) return { ok: false, error: "Bunganya maksimal 25% per tahun.", kolom: "bunga" };
  const tenor = Number(i.tenor);
  if (!Number.isInteger(tenor) || tenor < 1) return { ok: false, error: "Tenornya minimal 1 hari.", kolom: "tenor" };
  if (tenor > (i.satuan === "hari" ? 3660 : 120)) return { ok: false, error: "Tenornya kepanjangan, maksimal 10 tahun.", kolom: "tenor" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.mulai) || Number.isNaN(Date.parse(`${i.mulai}T00:00:00Z`))) return { ok: false, error: "Tanggal mulainya nggak valid.", kolom: "mulai" };
  const pajak = bacaPersen(i.pajak);
  if (!(pajak >= 0 && pajak <= 100)) return { ok: false, error: "Pajaknya 0–100%.", kolom: "pajak" };
  return { ok: true, data: { bunga_persen: bunga, tenor, satuan_tenor: i.satuan, pajak_persen: pajak, mulai: i.mulai } };
}

/**
 * Baris "Disisihkan ke tujuan" di Profil → Kantong (SPEC-simpanan U3):
 * nominalnya hanya tujuan yang terpisah (null = tidak ada, nominal tidak
 * ditampilkan), keterangannya menyebut tempat tujuan yang disimpan di
 * kantong lain: "1 tujuan · disimpan di BCA", "2 tujuan · 1 disimpan di BCA".
 */
export function ringkasDisisihkan(tujuan: { saldo: number; induk: string | null }[]): { total: number | null; keterangan: string } {
  const terpisah = tujuan.filter((t) => !t.induk);
  const disimpan = tujuan.filter((t) => t.induk);
  const total = terpisah.length ? terpisah.reduce((n, t) => n + t.saldo, 0) : null;
  if (!disimpan.length) return { total, keterangan: `${tujuan.length} tujuan tabungan` };
  const tempat = [...new Set(disimpan.map((t) => t.induk))].join(", ");
  const berapa = disimpan.length === tujuan.length ? "" : `${disimpan.length} `;
  return { total, keterangan: `${tujuan.length} tujuan · ${berapa}disimpan di ${tempat}` };
}
