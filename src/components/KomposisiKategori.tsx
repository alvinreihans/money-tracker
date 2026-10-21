"use client";

import { Banner, Heading, ProgressBar, Text } from "@primer/react";
import { Blankslate } from "@primer/react/experimental";
import { GraphIcon } from "@primer/octicons-react";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtIDRRingkas, labelKategori } from "@/lib/format";
import type { AvgMonthlyExpenseRow } from "@/types/transaction";

/**
 * Porsi pengeluaran per kategori sebagai satu bar bersegmen plus legenda —
 * pola yang sama dengan bar bahasa di halaman repo GitHub. Primer tidak punya
 * komponen chart, dan untuk pertanyaan "uangku habis ke mana" bar porsi sudah
 * cukup; nama kategori di legenda tetap terbaca utuh di layar HP.
 */

const WARNA = ["blue", "green", "orange", "purple", "pink", "teal", "yellow", "red"].map(
  (w) => `var(--data-${w}-color-emphasis)`,
);

export default function KomposisiKategori({
  data,
  error,
}: {
  data: AvgMonthlyExpenseRow[];
  error: string | null;
}) {
  const baris = data
    .map((r) => ({ kategori: r.category, nilai: Number(r.avg_monthly) }))
    .filter((r) => r.nilai > 0)
    .sort((a, b) => b.nilai - a.nilai);
  const total = baris.reduce((t, r) => t + r.nilai, 0);
  const persen = (n: number) => Math.round((n / total) * 100);

  return (
    <section className={s.kotak}>
      <div className={s.kotakKepala}>
        <Heading as="h2" variant="small">
          Pengeluaran per kategori
        </Heading>
        <span className={s.redup}>rerata 3 bulan penuh</span>
      </div>

      <div className={s.kotakIsi}>
        {error ? (
          <Banner variant="critical" title="Gagal ambil data" description={error} />
        ) : baris.length === 0 ? (
          <Blankslate>
            <Blankslate.Visual>
              <GraphIcon size="medium" />
            </Blankslate.Visual>
            <Blankslate.Heading>Belum ada pengeluaran di rentang ini</Blankslate.Heading>
            <Blankslate.Description>
              Ini cuma menghitung 3 bulan penuh terakhir, jadi transaksi bulan berjalan belum ikut.
            </Blankslate.Description>
          </Blankslate>
        ) : (
          <>
            <div className={s.statNilai}>{fmtIDRRingkas(total)}</div>
            <Text size="small" className={s.redup}>
              total rerata per bulan
            </Text>

            <div style={{ marginTop: "var(--base-size-12)" }}>
              <ProgressBar barSize="large" aria-label="Porsi pengeluaran per kategori">
                {baris.map((r, i) => (
                  <ProgressBar.Item
                    key={r.kategori}
                    progress={(r.nilai / total) * 100}
                    // `bg` cuma menerima token semantik ("success.emphasis");
                    // warna data-vis dipasang lewat variabel yang dibacanya.
                    style={{ "--progress-bg": WARNA[i % WARNA.length] } as React.CSSProperties}
                    aria-label={`${labelKategori(r.kategori)} ${persen(r.nilai)}%`}
                  />
                ))}
              </ProgressBar>
            </div>

            <ul className={s.legenda}>
              {baris.map((r, i) => (
                <li key={r.kategori}>
                  <span className={s.titik} style={{ background: WARNA[i % WARNA.length] }} />
                  <Text weight="semibold">{labelKategori(r.kategori)}</Text>
                  <span className={s.redup}>{persen(r.nilai)}%</span>
                  <span className={`${s.nominal} ${s.dorong}`}>{fmtIDR(r.nilai)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
