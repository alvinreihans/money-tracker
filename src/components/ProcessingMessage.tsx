"use client";

import { useEffect, useState } from "react";

/**
 * Spinner + pesan yang berubah makin lama nunggu.
 *
 * Tahap pertama sengaja netral: mayoritas struk selesai dalam 3-4 detik, dan
 * lelucon yang nongol langsung malah terasa dipaksakan. Candaan baru keluar
 * kalau nunggunya memang kelamaan — di situ justru membantu, karena user jadi
 * tahu sistemnya masih hidup, bukan nge-hang.
 */

export interface Tahap {
  /** Detik minimal sebelum pesan ini dipakai. */
  detik: number;
  teks: string;
}

export const TAHAP_STRUK: Tahap[] = [
  { detik: 0, teks: "Lagi baca struknya..." },
  { detik: 4, teks: "Bentar, struknya agak panjang nih..." },
  { detik: 9, teks: "Ini borong satu toko atau gimana?" },
  { detik: 14, teks: "Sabar ya, lagi ngitung kerugian dompetmu..." },
];

export const TAHAP_STATEMENT: Tahap[] = [
  { detik: 0, teks: "Lagi baca rekening korannya..." },
  { detik: 8, teks: "Halamannya lumayan banyak nih..." },
  { detik: 20, teks: "Masih jalan, ini transaksi sebulan penuh..." },
  { detik: 35, teks: "Sabar ya, diitungin satu-satu biar nggak ada yang kelewat..." },
];

export default function ProcessingMessage({
  tahap = TAHAP_STRUK,
  className = "",
}: {
  tahap?: Tahap[];
  className?: string;
}) {
  const [detik, setDetik] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setDetik((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Ambil tahap terakhir yang ambangnya sudah terlewat.
  const pesan =
    [...tahap].reverse().find((t) => detik >= t.detik)?.teks ?? tahap[0].teks;

  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700"
      />
      <span>{pesan}</span>
    </span>
  );
}
