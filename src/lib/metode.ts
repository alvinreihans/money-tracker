import type { SupabaseClient } from "@supabase/supabase-js";
import { isoLokal } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";

/**
 * Metode budgeting (SPEC-metode-budget): penghasilan bulanan dibagi ke
 * kelompok dengan persentase (50/30/20, 80/20, 70/20/10, kustom), lalu
 * dibandingkan dengan realisasinya. Penghasilan & tujuan tabungan:
 * SPEC-tujuan-tabungan. Fungsi murni — dipakai Analitik, Beranda, Tanya AI.
 */

export const KELOMPOK = ["kebutuhan", "keinginan", "tabungan", "berbagi", "pengembangan", "tak_terduga"] as const;
export type Kelompok = (typeof KELOMPOK)[number];

/**
 * Kelompok yang punya isian persen di Kustom. Pengembangan diri & Tak terduga
 * (untuk 6 Jars & Kakeibo, SPEC-kelompok-baru) dihitung Kebutuhan di metode
 * persentase.
 */
export const KELOMPOK_KUSTOM = ["kebutuhan", "keinginan", "tabungan", "berbagi"] as const;
export type KelompokKustom = (typeof KELOMPOK_KUSTOM)[number];
const IKUT_KEBUTUHAN: Kelompok[] = ["pengembangan", "tak_terduga"];

export const NAMA_KELOMPOK: Record<Kelompok, string> = {
  kebutuhan: "Kebutuhan",
  keinginan: "Keinginan",
  tabungan: "Tabungan & investasi",
  berbagi: "Berbagi",
  pengembangan: "Pengembangan diri",
  tak_terduga: "Tak terduga",
};

export const METODE = ["kategori", "zero-based", "50-30-20", "80-20", "70-20-10", "6-jars", "pyf", "kakeibo", "kustom"] as const;
export type Metode = (typeof METODE)[number];

/** Nama & penjelasan singkat tiap metode (Profil → Budget, Analitik, Tanya AI). */
export const LABEL_METODE: Record<Metode, { nama: string; ket: string }> = {
  kategori: { nama: "Per kategori", ket: "Target rupiah untuk tiap kategori." },
  "50-30-20": { nama: "50/30/20", ket: "Kebutuhan 50% · Keinginan 30% · Tabungan 20%" },
  "80-20": { nama: "80/20", ket: "Pengeluaran 80% · Tabungan 20%" },
  "70-20-10": { nama: "70/20/10", ket: "Biaya hidup 70% · Tabungan 20% · Berbagi 10%" },
  kustom: { nama: "Kustom", ket: "Atur sendiri persen tiap kelompok." },
  // SPEC-metode-lanjutan
  "zero-based": { nama: "Zero-Based", ket: "Target per kategori + tabungan = penghasilan." },
  pyf: { nama: "Pay Yourself First", ket: "Sisihkan tabungan dulu, sisanya bebas." },
  "6-jars": { nama: "6 Jars", ket: "Kebutuhan 55% · Hiburan, Pendidikan, Tabungan, Investasi 10% · Berbagi 5%" },
  kakeibo: { nama: "Kakeibo", ket: "Empat pos belanja, target tabungan, refleksi akhir bulan." },
};

export interface SaranPenghasilan {
  nilai: number;
  /** rerata: dari `bulan` bulan penuh terakhir; bulan-ini: belum ada riwayat sebulan penuh. */
  sumber: "rerata" | "bulan-ini" | "kosong";
  bulan: number;
}

export interface PengaturanMetode {
  metode: Metode;
  persen: Partial<Record<KelompokKustom, number>> | null;
  /** Penghasilan per bulan yang dibagi metode: yang diatur user, atau saran. */
  penghasilan: number;
  /** Diatur user di Profil → Budget; null = ikut saran. */
  penghasilanDiatur: number | null;
  saran: SaranPenghasilan;
  /** Kantong tujuan tabungan: pengeluaran darinya di luar jatah bulanan. */
  tujuan: { id: string; nama: string }[];
  /** Setoran bersih ke tujuan di bulan yang diminta (setoranBersih). */
  keTujuan: number;
  /** Target tabungan rupiah per bulan (Zero-Based, Kakeibo); null = belum diatur. */
  targetTabungan: number | null;
  /** Σ target budget per kategori (Zero-Based). */
  totalTarget: number;
  /** Penghasilan yang sudah masuk di bulan berjalan (kartu "Belum disisihkan"). */
  penghasilanBulanIni: number;
}

/**
 * Setoran bersih ke tujuan tabungan (SPEC-metode-lanjutan): pindah dari
 * kantong biasa ke tujuan, dikurangi tarikan dari tujuan ke kantong biasa.
 * Pindah antar tujuan tidak dihitung; transfer pelengkap dibuang pemanggil.
 */
export function setoranBersih(
  pindah: { amount: number | string; kantong_id: string | null; kantong_tujuan_id: string | null }[],
  idTujuan: Set<string>,
): number {
  let n = 0;
  for (const t of pindah) {
    const dari = t.kantong_id != null && idTujuan.has(t.kantong_id);
    const ke = t.kantong_tujuan_id != null && idTujuan.has(t.kantong_tujuan_id);
    if (ke && !dari) n += Number(t.amount);
    else if (dari && !ke) n -= Number(t.amount);
  }
  return n;
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
  const [{ data }, { data: kategori }, { data: masuk }, { data: tujuan }, { data: setor }, { data: budgets }] = await Promise.all([
    supabase.from("metode_budget").select("metode, persen, penghasilan, target_tabungan").maybeSingle(),
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
      .select("amount, kantong_id, kantong_tujuan_id")
      .eq("type", "transfer")
      .eq("status", "confirmed")
      .is("pelengkap_tujuan", null)
      .not("kantong_tujuan_id", "is", null)
      .gte("transaction_date", `${bulan}-01`)
      .lt("transaction_date", `${geserBulan(bulan, 1)}-01`),
    supabase.from("budgets").select("amount"),
  ]);
  const metode = (METODE as readonly string[]).includes(data?.metode) ? (data!.metode as Metode) : "kategori";
  const slugPenghasilan = new Set((kategori ?? []).map((k) => k.slug));
  const saran = saranPenghasilan(masuk ?? [], slugPenghasilan, bulanIni);
  const diatur = Number(data?.penghasilan) > 0 ? Number(data!.penghasilan) : null;
  const idTujuan = new Set((tujuan ?? []).map((k) => k.id));
  return {
    metode,
    persen: (data?.persen as PengaturanMetode["persen"]) ?? null,
    penghasilan: diatur ?? saran.nilai,
    penghasilanDiatur: diatur,
    saran,
    tujuan: (tujuan ?? []).map((k) => ({ id: k.id, nama: k.name })),
    keTujuan: setoranBersih(setor ?? [], idTujuan),
    targetTabungan: Number(data?.target_tabungan) > 0 ? Number(data!.target_tabungan) : null,
    totalTarget: (budgets ?? []).reduce((n, b) => n + Number(b.amount), 0),
    penghasilanBulanIni: (masuk ?? [])
      .filter((t) => slugPenghasilan.has(t.category) && t.transaction_date.startsWith(bulanIni))
      .reduce((n, t) => n + Number(t.amount), 0),
  };
}

export interface Wadah {
  id: string;
  nama: string;
  /** Kelompok pengeluaran yang dihitung di wadah ini. */
  kelompok: Kelompok[];
  /** Persen penghasilan; 0 untuk pos tanpa jatah dan target rupiah tetap. */
  persen: number;
  /**
   * Asal realisasinya: pengeluaran kelompoknya (bawaan); sisa penghasilan
   * (tabungan metode persentase); setoran bersih ke tujuan tabungan; atau
   * setoran + pengeluaran kelompok tabungan (SPEC-metode-lanjutan).
   */
  sumber?: "pengeluaran" | "sisa" | "setoran-tujuan" | "setoran-total";
  /** Target rupiah tetap, bukan persen penghasilan (tabungan Zero-Based & Kakeibo). */
  targetTetap?: number;
  /** Pos tanpa jatah (Kakeibo): nominal & porsinya dari total belanja saja. */
  tanpaJatah?: boolean;
  /** Hanya "lewat" bila melebihi jatahnya, tanpa "hampir" (Bebas dipakai, PYF). */
  bebas?: boolean;
}

/**
 * Wadah tiap metode. Berbagi (zakat, sedekah) di 50/30/20 dan 80/20 ikut
 * Kebutuhan — kewajiban, bukan keinginan; di 70/20/10 dan kustom ia punya
 * wadah sendiri. `targetTabungan`: rupiah per bulan untuk Zero-Based & Kakeibo.
 */
export function wadahMetode(metode: Metode, persen?: Partial<Record<KelompokKustom, number>> | null, targetTabungan?: number | null): Wadah[] {
  switch (metode) {
    case "50-30-20":
      return [
        { id: "kebutuhan", nama: "Kebutuhan", kelompok: ["kebutuhan", "berbagi", ...IKUT_KEBUTUHAN], persen: 50 },
        { id: "keinginan", nama: "Keinginan", kelompok: ["keinginan"], persen: 30 },
        { id: "tabungan", nama: "Tabungan & investasi", kelompok: ["tabungan"], persen: 20, sumber: "sisa" },
      ];
    case "80-20":
      return [
        { id: "pengeluaran", nama: "Pengeluaran", kelompok: ["kebutuhan", "keinginan", "berbagi", ...IKUT_KEBUTUHAN], persen: 80 },
        { id: "tabungan", nama: "Tabungan & investasi", kelompok: ["tabungan"], persen: 20, sumber: "sisa" },
      ];
    case "70-20-10":
      return [
        { id: "biaya-hidup", nama: "Biaya hidup", kelompok: ["kebutuhan", "keinginan", ...IKUT_KEBUTUHAN], persen: 70 },
        { id: "tabungan", nama: "Tabungan & investasi", kelompok: ["tabungan"], persen: 20, sumber: "sisa" },
        { id: "berbagi", nama: "Berbagi", kelompok: ["berbagi"], persen: 10 },
      ];
    case "kustom":
      return KELOMPOK_KUSTOM.map(
        (k): Wadah => ({
          id: k,
          nama: NAMA_KELOMPOK[k],
          kelompok: k === "kebutuhan" ? [k, ...IKUT_KEBUTUHAN] : [k],
          persen: Math.max(0, Math.round(persen?.[k] ?? 0)),
          ...(k === "tabungan" ? { sumber: "sisa" as const } : {}),
        }),
      ).filter((w) => w.persen > 0);
    // SPEC-metode-lanjutan: tabungan dari setoran nyata, bukan sisa.
    case "pyf": {
      const p = Math.min(90, Math.max(1, Math.round(persen?.tabungan ?? 20)));
      return [
        { id: "tabungan", nama: "Tabungan", kelompok: ["tabungan"], persen: p, sumber: "setoran-total" },
        { id: "bebas", nama: "Bebas dipakai", kelompok: KELOMPOK.filter((k) => k !== "tabungan"), persen: 100 - p, bebas: true },
      ];
    }
    case "6-jars":
      return [
        { id: "kebutuhan", nama: "Kebutuhan", kelompok: ["kebutuhan", "tak_terduga"], persen: 55 },
        { id: "hiburan", nama: "Hiburan", kelompok: ["keinginan"], persen: 10 },
        { id: "pendidikan", nama: "Pendidikan", kelompok: ["pengembangan"], persen: 10 },
        { id: "tabungan-panjang", nama: "Tabungan jangka panjang", kelompok: [], persen: 10, sumber: "setoran-tujuan" },
        { id: "kebebasan", nama: "Kebebasan finansial", kelompok: ["tabungan"], persen: 10 },
        { id: "berbagi", nama: "Berbagi", kelompok: ["berbagi"], persen: 5 },
      ];
    case "kakeibo":
      return [
        { id: "bertahan", nama: "Bertahan hidup", kelompok: ["kebutuhan", "berbagi"], persen: 0, tanpaJatah: true },
        { id: "pilihan", nama: "Pilihan", kelompok: ["keinginan"], persen: 0, tanpaJatah: true },
        { id: "budaya", nama: "Budaya", kelompok: ["pengembangan"], persen: 0, tanpaJatah: true },
        { id: "ekstra", nama: "Ekstra", kelompok: ["tak_terduga"], persen: 0, tanpaJatah: true },
        { id: "tabungan", nama: "Tabungan", kelompok: ["tabungan"], persen: 0, sumber: "setoran-total", targetTetap: targetTabungan ?? 0 },
      ];
    case "zero-based":
      return [{ id: "tabungan", nama: "Tabungan", kelompok: ["tabungan"], persen: 0, sumber: "setoran-total", targetTetap: targetTabungan ?? 0 }];
    default:
      return [];
  }
}

/** Persen kustom sah: empat bilangan bulat 0–100 yang jumlahnya 100. */
export function cekPersen(persen: Partial<Record<KelompokKustom, unknown>>): { ok: true; persen: Record<KelompokKustom, number> } | { ok: false; error: string } {
  const hasil = {} as Record<KelompokKustom, number>;
  for (const k of KELOMPOK_KUSTOM) {
    const n = Number(persen[k] ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false, error: `Persen ${NAMA_KELOMPOK[k]} harus 0–100.` };
    hasil[k] = n;
  }
  const total = KELOMPOK_KUSTOM.reduce((t, k) => t + hasil[k], 0);
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
  /** Realisasi ÷ target × 100, dibulatkan; pos tanpa jatah: porsinya dari total belanja. */
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
  /** Setoran bersih ke tujuan tabungan bulan itu (bisa negatif: lebih banyak ditarik). */
  keTujuan: number;
  /** Zero-Based: penghasilan − Σ target kategori − target tabungan; 0 = semua rupiah punya tugas. */
  belumDialokasikan?: number;
  /** Kakeibo: penghasilan − target tabungan, dibanding yang dibelanjakan (tanpa kelompok tabungan). */
  kakeibo?: { bisaDibelanjakan: number; dibelanjakan: number; sisa: number };
}

/** Wadah tabungan (dibaca terbalik): kelompok tabungan, sisa, atau setoran. */
export const wadahTabungan = (w: Wadah) => w.kelompok.includes("tabungan") || (w.sumber != null && w.sumber !== "pengeluaran");

/**
 * Target & realisasi tiap wadah untuk satu bulan. Metode persentase:
 * tabungan = basis − pengeluaran selain kelompok tabungan (yang tidak
 * dibelanjakan dianggap tersimpan; beli emas/reksadana yang dikelompokkan
 * tabungan tidak menguranginya). Metode lanjutan: tabungan = setoran nyata
 * (`sumber`). Pengeluaran dari kantong tujuan tabungan memakai uang yang
 * disisihkan sebelumnya, jadi di luar semua wadah. Null untuk metode "kategori".
 */
export function hitungMetode(
  pengaturan: Pick<PengaturanMetode, "metode" | "persen" | "penghasilan"> &
    Partial<Pick<PengaturanMetode, "tujuan" | "keTujuan" | "targetTabungan" | "totalTarget">>,
  ini: BarisMetode[],
): HasilMetode | null {
  const wadah = wadahMetode(pengaturan.metode, pengaturan.persen, pengaturan.targetTabungan);
  if (!wadah.length) return null;
  const basis = pengaturan.penghasilan;
  const keTujuan = pengaturan.keTujuan ?? 0;
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

  const realisasiDari = (w: Wadah) => {
    switch (w.sumber) {
      case "sisa":
        return Math.max(0, basis - bukanTabungan);
      case "setoran-tujuan":
        return keTujuan;
      case "setoran-total":
        return keTujuan + (keluar.get("tabungan") ?? 0);
      default:
        return w.kelompok.reduce((n, k) => n + (keluar.get(k) ?? 0), 0);
    }
  };

  const targetTabungan = pengaturan.targetTabungan ?? 0;
  return {
    metode: pengaturan.metode,
    basis,
    dariTujuan: [...dariTujuan].map(([nama, jumlah]) => ({ nama, jumlah })),
    keTujuan,
    ...(pengaturan.metode === "zero-based" ? { belumDialokasikan: basis - (pengaturan.totalTarget ?? 0) - targetTabungan } : {}),
    ...(pengaturan.metode === "kakeibo"
      ? { kakeibo: { bisaDibelanjakan: basis - targetTabungan, dibelanjakan: bukanTabungan, sisa: basis - targetTabungan - bukanTabungan } }
      : {}),
    wadah: wadah.map((w): HasilWadah => {
      const realisasi = realisasiDari(w);
      const tabungan = wadahTabungan(w);
      if (w.tanpaJatah) {
        const porsi = bukanTabungan > 0 ? Math.round((realisasi / bukanTabungan) * 100) : 0;
        return { ...w, target: 0, realisasi, terpakai: porsi, status: "aman", tabungan };
      }
      const target = w.targetTetap ?? Math.round((basis * w.persen) / 100);
      const terpakai = Math.max(0, target > 0 ? Math.round((realisasi / target) * 100) : realisasi > 0 ? 100 : 0);
      const status: StatusWadah = tabungan
        ? realisasi >= target
          ? "tercapai"
          : "kurang"
        : terpakai > 100
          ? "lewat"
          : terpakai >= 80 && !w.bebas
            ? "hampir"
            : "aman";
      return { ...w, target, realisasi, terpakai, status, tabungan };
    }),
  };
}
