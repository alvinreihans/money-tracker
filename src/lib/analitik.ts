import { geserHari, isoLokal, namaBulan } from "@/lib/format";

/**
 * Perhitungan analitik Beranda. Fungsi murni — datanya diambil di halaman,
 * hitungannya di sini supaya bisa diuji tanpa database (scripts/uji-analitik.mts).
 * Semua tanggal dalam WIB, lewat isoLokal.
 */

export interface BarisNominal {
  amount: number | string;
  type: string;
  transaction_date: string;
}

export interface Bulan {
  /** "YYYY-MM" */
  kunci: string;
  /** "Okt" */
  label: string;
  masuk: number;
  keluar: number;
  sisa: number;
}

/** Pemasukan, pengeluaran, dan sisa per bulan, `jumlah` bulan terakhir (yang terlama dulu). */
export function trenBulanan(baris: BarisNominal[], sekarang = new Date(), jumlah = 6): Bulan[] {
  const [tahun, bulan] = isoLokal(sekarang).split("-").map(Number);
  const daftar: Bulan[] = [];
  for (let i = jumlah - 1; i >= 0; i--) {
    const idx = tahun * 12 + (bulan - 1) - i;
    const kunci = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
    daftar.push({ kunci, label: namaBulan(`${kunci}-01`).slice(0, 3), masuk: 0, keluar: 0, sisa: 0 });
  }

  const perKunci = new Map(daftar.map((b) => [b.kunci, b]));
  for (const r of baris) {
    const b = perKunci.get(r.transaction_date.slice(0, 7));
    if (!b) continue;
    // Pindah kantong bukan pemasukan maupun pengeluaran.
    if (r.type === "income") b.masuk += Number(r.amount);
    else if (r.type === "expense") b.keluar += Number(r.amount);
  }
  for (const b of daftar) b.sisa = b.masuk - b.keluar;
  return daftar;
}

/**
 * Hari berturut-turut (WIB) yang punya minimal satu catatan, dihitung dari
 * waktu MENCATAT (created_at), bukan tanggal transaksi — mengisi tanggal
 * mundur tidak menambah streak.
 *
 * Belum mencatat hari ini tidak langsung memutus streak: selama kemarin
 * tercatat, streak masih hidup dan menunggu dilanjutkan.
 */
export function hitungStreak(waktuCatat: string[], sekarang = new Date()): { hari: number; hariIni: boolean } {
  const tanggal = new Set(waktuCatat.map((w) => isoLokal(new Date(w))));
  const hariIni = isoLokal(sekarang);
  const adaHariIni = tanggal.has(hariIni);

  let d = adaHariIni ? hariIni : geserHari(hariIni, -1);
  let hari = 0;
  while (tanggal.has(d)) {
    hari++;
    d = geserHari(d, -1);
  }
  return { hari, hariIni: adaHariIni };
}

export interface ProgresBudget {
  kategori: string;
  target: number;
  aktual: number;
  /** Negatif kalau sudah lewat target. */
  sisa: number;
  /** Aktual ÷ target × 100, dibulatkan; bisa lebih dari 100. */
  persen: number;
  /** aman ≤ 80%, waspada > 80%, lewat > 100%. */
  status: "aman" | "waspada" | "lewat";
}

/**
 * Aktual vs target bulan ini untuk tiap kategori yang punya target, yang
 * paling mendekati/melewati target di atas. `keluar` cukup baris pengeluaran
 * terkonfirmasi bulan ini; baris jenis lain diabaikan.
 */
export function progresBudget(
  target: { category: string; amount: number | string }[],
  keluar: { category: string; amount: number | string; type?: string }[],
): ProgresBudget[] {
  const aktual = new Map<string, number>();
  for (const k of keluar) {
    if (k.type && k.type !== "expense") continue;
    aktual.set(k.category, (aktual.get(k.category) ?? 0) + Number(k.amount));
  }
  return target
    .map(({ category, amount }) => {
      const t = Number(amount);
      const a = aktual.get(category) ?? 0;
      const persen = Math.round((a / t) * 100);
      const status: ProgresBudget["status"] = a > t ? "lewat" : a > t * 0.8 ? "waspada" : "aman";
      return { kategori: category, target: t, aktual: a, sisa: t - a, persen, status };
    })
    .sort((x, y) => y.aktual / y.target - x.aktual / x.target);
}
