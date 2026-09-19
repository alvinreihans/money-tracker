import { isoLokal } from "@/lib/format";

/**
 * Batas bulan untuk query ringkasan.
 *
 * Dihitung di zona waktu lokal, bukan lewat toISOString(): di UTC+7 konversi ke
 * UTC menggeser tanggal satu hari mundur, sehingga transaksi tanggal 31 bulan
 * lalu ikut terhitung sebagai bulan ini.
 */
export function rentangBulan() {
  const awalIni = new Date();
  awalIni.setDate(1);

  const awalLalu = new Date(awalIni);
  awalLalu.setMonth(awalLalu.getMonth() - 1);

  return {
    awalBulanIni: isoLokal(awalIni),
    awalBulanLalu: isoLokal(awalLalu),
  };
}
