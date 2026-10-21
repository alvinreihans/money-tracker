"use client";

import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import PieChart from "@cloudscape-design/components/pie-chart";
import { fmtIDR, fmtIDRRingkas, labelKategori } from "@/lib/format";
import type { AvgMonthlyExpenseRow } from "@/types/transaction";

/**
 * Donat, bukan batang: yang ditanyakan "uangku habis ke mana", yaitu porsi
 * tiap kategori. Di layar HP, label sumbu chart batang terpotong jadi "...",
 * sedangkan legenda donat menampilkan nama kategori utuh.
 */
export default function SpendingByCategoryChart({
  data,
  error,
}: {
  data: AvgMonthlyExpenseRow[];
  error: string | null;
}) {
  const total = data.reduce((s, r) => s + Number(r.avg_monthly), 0);

  return (
    <Container
      header={
        <Header variant="h2" description="Rerata bulanan selama 3 bulan penuh terakhir.">
          Pengeluaran per kategori
        </Header>
      }
    >
      <PieChart
        variant="donut"
        ariaLabel="Rata-rata pengeluaran bulanan per kategori"
        data={data.map((r) => ({ title: labelKategori(r.category), value: Number(r.avg_monthly) }))}
        innerMetricValue={fmtIDRRingkas(total)}
        innerMetricDescription="rerata / bulan"
        detailPopoverContent={(d, sum) => [
          { key: "Rerata per bulan", value: fmtIDR(d.value) },
          { key: "Porsi", value: `${Math.round((d.value / sum) * 100)}%` },
        ]}
        segmentDescription={(d, sum) => `${fmtIDRRingkas(d.value)} · ${Math.round((d.value / sum) * 100)}%`}
        hideFilter
        size="medium"
        statusType={error ? "error" : "finished"}
        errorText={`Gagal ambil data: ${error}`}
        empty={
          <Box textAlign="center" color="inherit">
            <b>Belum ada pengeluaran di rentang ini.</b>
            <Box variant="p" color="inherit">
              Chart ini cuma menghitung 3 bulan penuh terakhir, jadi transaksi bulan berjalan belum
              ikut.
            </Box>
          </Box>
        }
      />
    </Container>
  );
}
