"use client";

import { useEffect, useState } from "react";
import { Spinner, Stack, Text } from "@primer/react";

/**
 * Spinner + pesan yang berganti tiap 25 detik dan mengulang dari awal.
 *
 * Pesan pertama sengaja netral: mayoritas struk selesai dalam beberapa detik,
 * dan lelucon yang nongol langsung terasa dipaksakan. Candaan baru muncul kalau
 * nunggunya memang kelamaan — di situ justru membantu, karena user jadi tahu
 * sistemnya masih hidup, bukan nge-hang.
 *
 * Berputar, bukan berhenti di pesan terakhir: kalau macet di satu kalimat,
 * layarnya terlihat beku dan orang keburu menganggapnya mati.
 */

const GANTI_TIAP_DETIK = 25;

export const TAHAP_STRUK = [
  "Lagi baca struknya...",
  "Bentar, struknya agak panjang nih...",
  "Ini borong satu toko atau gimana?",
  "Sabar ya, lagi ngitung kerugian dompetmu...",
];

export const TAHAP_STATEMENT = [
  "Lagi baca rekening korannya...",
  "Halamannya lumayan banyak nih...",
  "Masih jalan, ini transaksi sebulan penuh...",
  "Sabar ya, diitungin satu-satu biar nggak ada yang kelewat...",
];

export default function ProcessingMessage({ tahap = TAHAP_STRUK }: { tahap?: string[] }) {
  const [detik, setDetik] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setDetik((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Modulo yang membuatnya berputar kembali ke pesan pertama.
  const pesan = tahap[Math.floor(detik / GANTI_TIAP_DETIK) % tahap.length];

  return (
    <Stack direction="horizontal" gap="condensed" align="center">
      <Spinner size="small" />
      <Text size="small">{pesan}</Text>
    </Stack>
  );
}
