"use client";

import BarisStreak from "@/components/BarisStreak";
import KartuBudget from "@/components/KartuBudget";
import KomposisiKategori from "@/components/KomposisiKategori";
import { AppBar } from "@/components/oneui";
import RingkasanBulan from "@/components/RingkasanBulan";
import TrenBulanan from "@/components/TrenBulanan";
import s from "@/components/ui.module.css";
import { namaBulan } from "@/lib/format";
import { rentangBulan } from "@/lib/periode";
import type { Bulan, ProgresBudget } from "@/lib/analitik";
import type { AvgMonthlyExpenseRow } from "@/types/transaction";

/**
 * Tab Analitik (SPEC-navigasi): "memahami" keuangan — ringkasan bulan, tren,
 * komposisi kategori, dan budget. Fase 1 memindahkan kartu yang dulu di
 * Beranda; pilih bulan & insight lain menyusul (fase 3).
 */
export default function AnalitikView({
  ringkasan,
  tren,
  rerata,
  rerataError,
  budget,
  streak,
}: {
  ringkasan: { keluar: number; masuk: number };
  tren: Bulan[];
  rerata: AvgMonthlyExpenseRow[];
  rerataError: string | null;
  budget: ProgresBudget[];
  streak: { hari: number; hariIni: boolean };
}) {
  const bulan = namaBulan(rentangBulan().awalBulanIni);
  return (
    <>
      <AppBar judul="Analitik" sub={bulan.charAt(0).toUpperCase() + bulan.slice(1)} />
      <div className={s.isi}>
        <RingkasanBulan keluar={ringkasan.keluar} masuk={ringkasan.masuk} />
        <TrenBulanan data={tren} />
        <KomposisiKategori data={rerata} error={rerataError} />
        <KartuBudget data={budget} bulan={bulan} />
        <BarisStreak streak={streak} />
      </div>
    </>
  );
}
