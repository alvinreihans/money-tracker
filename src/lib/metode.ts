import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Metode budgeting (SPEC-metode-budget): pemasukan bulanan dibagi ke kelompok
 * dengan persentase (50/30/20, 80/20, 70/20/10, kustom), lalu dibandingkan
 * dengan realisasinya. Fungsi murni — dipakai Analitik, Beranda, dan Tanya AI.
 */

export const KELOMPOK = ["kebutuhan", "keinginan", "tabungan", "berbagi"] as const;
export type Kelompok = (typeof KELOMPOK)[number];

export const NAMA_KELOMPOK: Record<Kelompok, string> = {
  kebutuhan: "Kebutuhan",
  keinginan: "Keinginan",
  tabungan: "Tabungan & investasi",
  berbagi: "Berbagi",
};

export const METODE = ["kategori", "50-30-20", "80-20", "70-20-10", "kustom"] as const;
export type Metode = (typeof METODE)[number];

/** Nama & penjelasan singkat tiap metode (Profil → Budget, Analitik, Tanya AI). */
export const LABEL_METODE: Record<Metode, { nama: string; ket: string }> = {
  kategori: { nama: "Per kategori", ket: "Target rupiah untuk tiap kategori." },
  "50-30-20": { nama: "50/30/20", ket: "Kebutuhan 50% · Keinginan 30% · Tabungan 20%" },
  "80-20": { nama: "80/20", ket: "Pengeluaran 80% · Tabungan 20%" },
  "70-20-10": { nama: "70/20/10", ket: "Biaya hidup 70% · Tabungan 20% · Berbagi 10%" },
  kustom: { nama: "Kustom", ket: "Atur sendiri persen tiap kelompok." },
};

export interface PengaturanMetode {
  metode: Metode;
  persen: Partial<Record<Kelompok, number>> | null;
}

/** Metode pilihan user; belum memilih = budget per kategori. */
export async function ambilPengaturanMetode(supabase: SupabaseClient): Promise<PengaturanMetode> {
  const { data } = await supabase.from("metode_budget").select("metode, persen").maybeSingle();
  const metode = (METODE as readonly string[]).includes(data?.metode) ? (data!.metode as Metode) : "kategori";
  return { metode, persen: (data?.persen as PengaturanMetode["persen"]) ?? null };
}

export interface Wadah {
  id: string;
  nama: string;
  /** Kelompok pengeluaran yang dihitung di wadah ini. */
  kelompok: Kelompok[];
  persen: number;
}

/**
 * Wadah tiap metode. Berbagi (zakat, sedekah) di 50/30/20 dan 80/20 ikut
 * Kebutuhan — kewajiban, bukan keinginan; di 70/20/10 dan kustom ia punya
 * wadah sendiri.
 */
export function wadahMetode(metode: Metode, persen?: Partial<Record<Kelompok, number>> | null): Wadah[] {
  switch (metode) {
    case "50-30-20":
      return [
        { id: "kebutuhan", nama: "Kebutuhan", kelompok: ["kebutuhan", "berbagi"], persen: 50 },
        { id: "keinginan", nama: "Keinginan", kelompok: ["keinginan"], persen: 30 },
        { id: "tabungan", nama: "Tabungan & investasi", kelompok: ["tabungan"], persen: 20 },
      ];
    case "80-20":
      return [
        { id: "pengeluaran", nama: "Pengeluaran", kelompok: ["kebutuhan", "keinginan", "berbagi"], persen: 80 },
        { id: "tabungan", nama: "Tabungan & investasi", kelompok: ["tabungan"], persen: 20 },
      ];
    case "70-20-10":
      return [
        { id: "biaya-hidup", nama: "Biaya hidup", kelompok: ["kebutuhan", "keinginan"], persen: 70 },
        { id: "tabungan", nama: "Tabungan & investasi", kelompok: ["tabungan"], persen: 20 },
        { id: "berbagi", nama: "Berbagi", kelompok: ["berbagi"], persen: 10 },
      ];
    case "kustom":
      return KELOMPOK.map((k) => ({ id: k, nama: NAMA_KELOMPOK[k], kelompok: [k], persen: Math.max(0, Math.round(persen?.[k] ?? 0)) })).filter(
        (w) => w.persen > 0,
      );
    default:
      return [];
  }
}

/** Persen kustom sah: empat bilangan bulat 0–100 yang jumlahnya 100. */
export function cekPersen(persen: Partial<Record<Kelompok, unknown>>): { ok: true; persen: Record<Kelompok, number> } | { ok: false; error: string } {
  const hasil = {} as Record<Kelompok, number>;
  for (const k of KELOMPOK) {
    const n = Number(persen[k] ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false, error: `Persen ${NAMA_KELOMPOK[k]} harus 0–100.` };
    hasil[k] = n;
  }
  const total = KELOMPOK.reduce((t, k) => t + hasil[k], 0);
  if (total !== 100) return { ok: false, error: `Jumlahnya harus 100% (sekarang ${total}%).` };
  return { ok: true, persen: hasil };
}

export interface BarisMetode {
  amount: number | string;
  type: string;
  category: string;
  /** Dari view: kelompok transaksi atau bawaan kategorinya (pengeluaran saja). */
  kelompok_efektif?: string | null;
  status?: string;
}

export type StatusWadah = "aman" | "hampir" | "lewat" | "tercapai" | "kurang";

export interface HasilWadah extends Wadah {
  target: number;
  realisasi: number;
  /** Realisasi ÷ target × 100, dibulatkan. */
  terpakai: number;
  status: StatusWadah;
  /** Tabungan: makin besar makin baik. */
  tabungan: boolean;
}

export interface HasilMetode {
  metode: Metode;
  /** Pemasukan yang dibagi (tanpa cashback/refund). */
  basis: number;
  /** Basis dari bulan lalu karena bulan ini belum ada pemasukan. */
  basisBulanLalu: boolean;
  wadah: HasilWadah[];
}

/** Pemasukan untuk dibagi: semua pemasukan kecuali cashback/refund (potongan belanja). */
export function pemasukanBasis(baris: BarisMetode[]): number {
  return baris.filter((t) => t.type === "income" && t.category !== "refund" && (t.status ?? "confirmed") === "confirmed").reduce((n, t) => n + Number(t.amount), 0);
}

/**
 * Target & realisasi tiap wadah untuk satu bulan. Tabungan = basis −
 * pengeluaran selain kelompok tabungan (yang tidak dibelanjakan dianggap
 * tersimpan; beli emas/reksadana yang dikelompokkan tabungan tidak
 * menguranginya). Null untuk metode "kategori".
 */
export function hitungMetode(
  pengaturan: { metode: Metode; persen?: Partial<Record<Kelompok, number>> | null },
  ini: BarisMetode[],
  lalu: BarisMetode[] = [],
): HasilMetode | null {
  const wadah = wadahMetode(pengaturan.metode, pengaturan.persen);
  if (!wadah.length) return null;
  const basisIni = pemasukanBasis(ini);
  const basisBulanLalu = basisIni === 0 && pemasukanBasis(lalu) > 0;
  const basis = basisBulanLalu ? pemasukanBasis(lalu) : basisIni;

  const keluar = new Map<string, number>();
  for (const t of ini) {
    if (t.type !== "expense" || (t.status ?? "confirmed") !== "confirmed") continue;
    const k = t.kelompok_efektif ?? "keinginan";
    keluar.set(k, (keluar.get(k) ?? 0) + Number(t.amount));
  }
  const bukanTabungan = [...keluar].filter(([k]) => k !== "tabungan").reduce((n, [, v]) => n + v, 0);

  return {
    metode: pengaturan.metode,
    basis,
    basisBulanLalu,
    wadah: wadah.map((w) => {
      const target = Math.round((basis * w.persen) / 100);
      const tabungan = w.kelompok.includes("tabungan");
      const realisasi = tabungan ? Math.max(0, basis - bukanTabungan) : w.kelompok.reduce((n, k) => n + (keluar.get(k) ?? 0), 0);
      const terpakai = target > 0 ? Math.round((realisasi / target) * 100) : realisasi > 0 ? 100 : 0;
      const status: StatusWadah = tabungan
        ? realisasi >= target
          ? "tercapai"
          : "kurang"
        : terpakai > 100
          ? "lewat"
          : terpakai >= 80
            ? "hampir"
            : "aman";
      return { ...w, target, realisasi, terpakai, status, tabungan };
    }),
  };
}
