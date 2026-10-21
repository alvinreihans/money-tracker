import { isoLokal } from "@/lib/format";

/**
 * Batas bulan untuk query ringkasan, dalam WIB (lihat isoLokal). Dihitung dari
 * string tanggal, bukan lewat setMonth() pada Date: hasil Date bergantung
 * zona waktu mesin yang menjalankannya.
 */
export function rentangBulan(sekarang = new Date()) {
  const [tahun, bulan] = isoLokal(sekarang).split("-").map(Number);
  const [tahunLalu, bulanLalu] = bulan === 1 ? [tahun - 1, 12] : [tahun, bulan - 1];
  const awal = (t: number, b: number) => `${t}-${String(b).padStart(2, "0")}-01`;

  return {
    awalBulanIni: awal(tahun, bulan),
    awalBulanLalu: awal(tahunLalu, bulanLalu),
  };
}
