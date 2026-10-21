import { ChartPie } from "lucide-react";
import { Kosong, Pesan } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtIDRRingkas, labelKategori } from "@/lib/format";
import type { AvgMonthlyExpenseRow } from "@/types/transaction";

/**
 * Porsi pengeluaran per kategori: satu bar bersegmen plus daftar. Untuk
 * pertanyaan "uangku habis ke mana", porsi sudah cukup; daftar di bawahnya
 * menampilkan nama kategori utuh, yang di chart biasa sering terpotong di HP.
 */

// Warna aksen dari palet sistem; area luas tetap tenang, warna hanya di bar kecil.
const WARNA = ["#3e91ff", "#5ecb7a", "#ffb340", "#bf7af0", "#ff7a9c", "#4fc9e0", "#ffd84a", "#ff5f5f"];

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
    <>
      <h2 className={s.subheader}>Pengeluaran per kategori</h2>
      {error ? (
        <Pesan jenis="bahaya" judul="Gagal ambil data">
          {error}
        </Pesan>
      ) : baris.length === 0 ? (
        <div className={s.blok}>
          <Kosong ikon={ChartPie} judul="Belum ada pengeluaran di rentang ini">
            Ini cuma menghitung 3 bulan penuh terakhir, jadi bulan berjalan belum ikut.
          </Kosong>
        </div>
      ) : (
        <section className={s.blok}>
          <div className={s.blokIsi} style={{ paddingBottom: 4 }}>
            <span className={s.redup}>Rerata per bulan, 3 bulan penuh terakhir</span>
            <div className={s.nominal} style={{ fontSize: 24, marginTop: 4 }}>
              {fmtIDRRingkas(total)}
            </div>
            <div className={s.bar} role="img" aria-label="Porsi pengeluaran per kategori">
              {baris.map((r, i) => (
                <span key={r.kategori} style={{ flex: r.nilai, background: WARNA[i % WARNA.length] }} />
              ))}
            </div>
          </div>
          {baris.map((r, i) => (
            <div key={r.kategori} className={s.baris} style={{ minHeight: 52 }}>
              <span className={s.titik} style={{ background: WARNA[i % WARNA.length] }} aria-hidden />
              <span className={s.barisTeks}>
                <span>{labelKategori(r.kategori)}</span>
              </span>
              <span className={s.redup}>{persen(r.nilai)}%</span>
              <span className={s.nominal}>{fmtIDR(r.nilai)}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
