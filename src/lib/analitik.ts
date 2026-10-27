import { geserHari, isoLokal, namaBulan } from "@/lib/format";

/**
 * Perhitungan analitik (Beranda & tab Analitik). Fungsi murni — datanya diambil di halaman,
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

// ---------------------------------------------------------------------------
// Analitik per bulan (SPEC-analitik-insight)
// ---------------------------------------------------------------------------

export interface BarisAnalitik extends BarisNominal {
  category: string;
  merchant: string | null;
  kantong_id?: string | null;
}

/**
 * Pengeluaran dari kantong tujuan tabungan dipisah dari angka bulanan
 * (SPEC-analitik-tujuan): uangnya disisihkan bulan-bulan sebelumnya, bukan
 * dari penghasilan bulan itu. `dariTujuan` dijumlah per tujuan.
 */
export function pisahTujuan<T extends { amount: number | string; type: string; kantong_id?: string | null }>(
  baris: T[],
  tujuan: { id: string; nama: string }[],
): { biasa: T[]; dariTujuan: { id: string; nama: string; total: number }[] } {
  const nama = new Map(tujuan.map((k) => [k.id, k.nama]));
  const biasa: T[] = [];
  const total = new Map<string, number>();
  for (const r of baris) {
    if (r.type === "expense" && r.kantong_id && nama.has(r.kantong_id)) total.set(r.kantong_id, (total.get(r.kantong_id) ?? 0) + Number(r.amount));
    else biasa.push(r);
  }
  return { biasa, dariTujuan: [...total].map(([id, t]) => ({ id, nama: nama.get(id)!, total: t })) };
}

export interface AnalisisBulan {
  keluar: number;
  masuk: number;
  keluarLalu: number;
  /** Perubahan keluar dari bulan lalu (%), null kalau bulan lalu kosong. */
  perubahanKeluar: number | null;
  /** Hanya bulan berjalan, mulai hari ke-3: rata-rata per hari × jumlah hari. */
  proyeksi: number | null;
  hariBoros: { tanggal: string; total: number } | null;
  /** Pengeluaran per kategori, terbesar dulu; perubahan null = bulan lalu kosong ("baru"). */
  kategori: { kategori: string; total: number; porsi: number; perubahan: number | null }[];
  /** Kategori dengan kenaikan rupiah terbesar dari bulan lalu (hanya yang naik). */
  kategoriNaik: { kategori: string; selisih: number; persen: number | null } | null;
  /** 5 merchant dengan total pengeluaran terbesar. */
  merchant: { nama: string; total: number; kali: number }[];
}

const persenUbah = (ini: number, lalu: number) => (lalu > 0 ? Math.round(((ini - lalu) / lalu) * 100) : null);

/**
 * Ringkasan, sorotan, kategori, dan merchant untuk satu bulan ("YYYY-MM"),
 * dibanding bulan sebelumnya. Pindah kantong tidak dihitung; cashback ikut
 * sebagai masuk. Merchant digabung tanpa memedulikan huruf besar-kecil &
 * spasi; nama yang tampil ejaan yang paling sering.
 */
export function analisisBulan(ini: BarisAnalitik[], lalu: BarisAnalitik[], { bulan, hariIni }: { bulan: string; hariIni: string }): AnalisisBulan {
  const keluarIni = ini.filter((r) => r.type === "expense");
  const jumlah = (rs: BarisAnalitik[], type: string) => rs.filter((r) => r.type === type).reduce((n, r) => n + Number(r.amount), 0);
  const keluar = jumlah(ini, "expense");
  const keluarLalu = jumlah(lalu, "expense");

  // Proyeksi: dari hari ke-3, supaya satu belanja di tanggal 1 tidak dikali 31.
  const hariKe = Number(hariIni.slice(8));
  const [t, b] = bulan.split("-").map(Number);
  const jumlahHari = new Date(Date.UTC(t, b, 0)).getUTCDate();
  const proyeksi = bulan === hariIni.slice(0, 7) && hariKe >= 3 && keluar > 0 ? Math.round((keluar / hariKe) * jumlahHari) : null;

  const perHari = new Map<string, number>();
  for (const r of keluarIni) perHari.set(r.transaction_date, (perHari.get(r.transaction_date) ?? 0) + Number(r.amount));
  const hariBoros = [...perHari].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1))[0];

  const perKategori = (rs: BarisAnalitik[]) => {
    const m = new Map<string, number>();
    for (const r of rs) if (r.type === "expense") m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount));
    return m;
  };
  const katIni = perKategori(ini);
  const katLalu = perKategori(lalu);
  const kategori = [...katIni]
    .map(([k, total]) => ({ kategori: k, total, porsi: Math.round((total / keluar) * 100), perubahan: persenUbah(total, katLalu.get(k) ?? 0) }))
    .sort((x, y) => y.total - x.total);
  const naik = [...katIni]
    .map(([k, total]) => ({ kategori: k, selisih: total - (katLalu.get(k) ?? 0), persen: persenUbah(total, katLalu.get(k) ?? 0) }))
    .filter((x) => x.selisih > 0)
    .sort((x, y) => y.selisih - x.selisih)[0];

  const perMerchant = new Map<string, { total: number; kali: number; ejaan: Map<string, number> }>();
  for (const r of keluarIni) {
    const nama = r.merchant?.trim().replace(/\s+/g, " ");
    if (!nama) continue;
    const m = perMerchant.get(nama.toLowerCase()) ?? { total: 0, kali: 0, ejaan: new Map<string, number>() };
    m.total += Number(r.amount);
    m.kali++;
    m.ejaan.set(nama, (m.ejaan.get(nama) ?? 0) + 1);
    perMerchant.set(nama.toLowerCase(), m);
  }
  const merchant = [...perMerchant.values()]
    .map((m) => ({ nama: [...m.ejaan].sort((x, y) => y[1] - x[1])[0][0], total: m.total, kali: m.kali }))
    .sort((x, y) => y.total - x.total || y.kali - x.kali)
    .slice(0, 5);

  return {
    keluar,
    masuk: jumlah(ini, "income"),
    keluarLalu,
    perubahanKeluar: persenUbah(keluar, keluarLalu),
    proyeksi,
    hariBoros: hariBoros ? { tanggal: hariBoros[0], total: hariBoros[1] } : null,
    kategori,
    kategoriNaik: naik ?? null,
    merchant,
  };
}
