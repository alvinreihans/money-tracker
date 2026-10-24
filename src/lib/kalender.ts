/**
 * Logika kalender rentang (filter Riwayat "Pilih rentang"). Fungsi murni —
 * diuji di scripts/uji-riwayat.mts. Tanggal selalu "YYYY-MM-DD".
 */

export interface Rentang {
  dari: string | null;
  sampai: string | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Sel kalender satu bulan ("YYYY-MM"), minggu mulai Senin seperti kalender
 * Indonesia: null untuk sel kosong sebelum tanggal 1, lalu tiap tanggal,
 * lalu null sampai baris terakhir genap 7.
 */
export function gridBulan(bulan: string): (string | null)[] {
  const [t, b] = bulan.split("-").map(Number);
  const awal = new Date(Date.UTC(t, b - 1, 1));
  const jumlah = new Date(Date.UTC(t, b, 0)).getUTCDate();
  const kosong = (awal.getUTCDay() + 6) % 7; // Senin = 0
  const sel: (string | null)[] = Array(kosong).fill(null);
  for (let h = 1; h <= jumlah; h++) sel.push(iso(new Date(Date.UTC(t, b - 1, h))));
  while (sel.length % 7) sel.push(null);
  return sel;
}

/** Geser "YYYY-MM" sebanyak n bulan. */
export function geserBulan(bulan: string, n: number): string {
  const [t, b] = bulan.split("-").map(Number);
  return iso(new Date(Date.UTC(t, b - 1 + n, 1))).slice(0, 7);
}

/**
 * Ketukan pada sebuah tanggal: ketuk pertama = awal, ketuk kedua = akhir
 * (ditukar kalau lebih awal dari awal), ketuk ketiga mulai rentang baru.
 */
export function ketukTanggal(r: Rentang, tanggal: string): Rentang {
  if (!r.dari || r.sampai) return { dari: tanggal, sampai: null };
  return tanggal < r.dari ? { dari: tanggal, sampai: r.dari } : { dari: r.dari, sampai: tanggal };
}
