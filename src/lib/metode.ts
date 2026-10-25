import type { SupabaseClient } from "@supabase/supabase-js";
import { isoLokal } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";

/**
 * Metode budgeting (SPEC-metode-budget): penghasilan bulanan dibagi ke
 * kelompok dengan persentase (50/30/20, 80/20, 70/20/10, kustom), lalu
 * dibandingkan dengan realisasinya. Penghasilan & tujuan tabungan:
 * SPEC-tujuan-tabungan. Fungsi murni — dipakai Analitik, Beranda, Tanya AI.
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

export interface SaranPenghasilan {
  nilai: number;
  /** rerata: dari `bulan` bulan penuh terakhir; bulan-ini: belum ada riwayat sebulan penuh. */
  sumber: "rerata" | "bulan-ini" | "kosong";
  bulan: number;
}

export interface PengaturanMetode {
  metode: Metode;
  persen: Partial<Record<Kelompok, number>> | null;
  /** Penghasilan per bulan yang dibagi metode: yang diatur user, atau saran. */
  penghasilan: number;
  /** Diatur user di Profil → Budget; null = ikut saran. */
  penghasilanDiatur: number | null;
  saran: SaranPenghasilan;
  /** Kantong tujuan tabungan: pengeluaran darinya di luar jatah bulanan. */
  tujuan: { id: string; nama: string }[];
  /** Disisihkan ke tujuan di bulan yang diminta (tanpa transfer pelengkap). */
  keTujuan: number;
}

/**
 * Saran penghasilan per bulan: rerata bulan penuh (3 terakhir) yang ada
 * penghasilannya, jadi tanggal gajian tidak berpengaruh. Belum ada riwayat
 * sebulan penuh → penghasilan bulan ini.
 */
export function saranPenghasilan(
  baris: { amount: number | string; category: string; transaction_date: string }[],
  penghasilan: Set<string>,
  bulanIni: string,
): SaranPenghasilan {
  const per = new Map<string, number>();
  for (const t of baris) {
    if (!penghasilan.has(t.category)) continue;
    const b = t.transaction_date.slice(0, 7);
    per.set(b, (per.get(b) ?? 0) + Number(t.amount));
  }
  const penuh = [1, 2, 3].map((n) => per.get(geserBulan(bulanIni, -n)) ?? 0).filter((n) => n > 0);
  if (penuh.length) return { nilai: Math.round(penuh.reduce((a, b) => a + b, 0) / penuh.length), sumber: "rerata", bulan: penuh.length };
  const ini = per.get(bulanIni) ?? 0;
  return ini > 0 ? { nilai: ini, sumber: "bulan-ini", bulan: 1 } : { nilai: 0, sumber: "kosong", bulan: 0 };
}

/**
 * Metode pilihan user (belum memilih = budget per kategori), penghasilan yang
 * dibagi, dan tujuan tabungan beserta setorannya di `bulan` ("YYYY-MM").
 */
export async function ambilPengaturanMetode(supabase: SupabaseClient, bulan?: string): Promise<PengaturanMetode> {
  const bulanIni = isoLokal(new Date()).slice(0, 7);
  bulan ??= bulanIni;
  const [{ data }, { data: kategori }, { data: masuk }, { data: tujuan }, { data: setor }] = await Promise.all([
    supabase.from("metode_budget").select("metode, persen, penghasilan").maybeSingle(),
    supabase.from("categories").select("slug").eq("type", "income").eq("penghasilan", true),
    supabase
      .from("transactions")
      .select("amount, category, transaction_date")
      .eq("type", "income")
      .eq("status", "confirmed")
      .gte("transaction_date", `${geserBulan(bulanIni, -3)}-01`),
    supabase.from("user_accounts").select("id, name").eq("kind", "tujuan"),
    supabase
      .from("transactions")
      .select("amount, kantong_tujuan_id")
      .eq("type", "transfer")
      .eq("status", "confirmed")
      .is("pelengkap_tujuan", null)
      .not("kantong_tujuan_id", "is", null)
      .gte("transaction_date", `${bulan}-01`)
      .lt("transaction_date", `${geserBulan(bulan, 1)}-01`),
  ]);
  const metode = (METODE as readonly string[]).includes(data?.metode) ? (data!.metode as Metode) : "kategori";
  const saran = saranPenghasilan(masuk ?? [], new Set((kategori ?? []).map((k) => k.slug)), bulanIni);
  const diatur = Number(data?.penghasilan) > 0 ? Number(data!.penghasilan) : null;
  const idTujuan = new Set((tujuan ?? []).map((k) => k.id));
  return {
    metode,
    persen: (data?.persen as PengaturanMetode["persen"]) ?? null,
    penghasilan: diatur ?? saran.nilai,
    penghasilanDiatur: diatur,
    saran,
    tujuan: (tujuan ?? []).map((k) => ({ id: k.id, nama: k.name })),
    keTujuan: (setor ?? []).filter((t) => idTujuan.has(t.kantong_tujuan_id)).reduce((n, t) => n + Number(t.amount), 0),
  };
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
  /** Pengeluaran dari kantong tujuan tabungan tidak dihitung di jatah bulanan. */
  kantong_id?: string | null;
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
  /** Penghasilan per bulan yang dibagi. */
  basis: number;
  wadah: HasilWadah[];
  /** Pengeluaran bulan itu yang dibayar dari tujuan tabungan, per tujuan. */
  dariTujuan: { nama: string; jumlah: number }[];
  /** Disisihkan ke tujuan tabungan bulan itu. */
  keTujuan: number;
}

/**
 * Target & realisasi tiap wadah untuk satu bulan. Tabungan = basis −
 * pengeluaran selain kelompok tabungan (yang tidak dibelanjakan dianggap
 * tersimpan; beli emas/reksadana yang dikelompokkan tabungan tidak
 * menguranginya). Pengeluaran dari kantong tujuan tabungan memakai uang yang
 * disisihkan sebelumnya, jadi di luar semua wadah. Null untuk metode "kategori".
 */
export function hitungMetode(
  pengaturan: Pick<PengaturanMetode, "metode" | "persen" | "penghasilan"> & Partial<Pick<PengaturanMetode, "tujuan" | "keTujuan">>,
  ini: BarisMetode[],
): HasilMetode | null {
  const wadah = wadahMetode(pengaturan.metode, pengaturan.persen);
  if (!wadah.length) return null;
  const basis = pengaturan.penghasilan;
  const namaTujuan = new Map((pengaturan.tujuan ?? []).map((k) => [k.id, k.nama]));

  const keluar = new Map<string, number>();
  const dariTujuan = new Map<string, number>();
  for (const t of ini) {
    if (t.type !== "expense" || (t.status ?? "confirmed") !== "confirmed") continue;
    const tujuan = t.kantong_id ? namaTujuan.get(t.kantong_id) : undefined;
    if (tujuan) {
      dariTujuan.set(tujuan, (dariTujuan.get(tujuan) ?? 0) + Number(t.amount));
      continue;
    }
    const k = t.kelompok_efektif ?? "keinginan";
    keluar.set(k, (keluar.get(k) ?? 0) + Number(t.amount));
  }
  const bukanTabungan = [...keluar].filter(([k]) => k !== "tabungan").reduce((n, [, v]) => n + v, 0);

  return {
    metode: pengaturan.metode,
    basis,
    dariTujuan: [...dariTujuan].map(([nama, jumlah]) => ({ nama, jumlah })),
    keTujuan: pengaturan.keTujuan ?? 0,
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
