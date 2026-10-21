import { ChartPie } from "lucide-react";
import { useKategori } from "@/components/Catat";
import { tandaKategori } from "@/components/kategori";
import { Kosong } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtIDRRingkas } from "@/lib/format";
import { cariKategori, namaKategori } from "@/lib/kategori";
import type { AvgMonthlyExpenseRow } from "@/types/transaction";

/**
 * Porsi pengeluaran per kategori: satu bar bersegmen plus daftar. Untuk
 * pertanyaan "uangku habis ke mana", porsi sudah cukup; daftar di bawahnya
 * menampilkan nama kategori utuh, yang di chart biasa sering terpotong di HP.
 *
 * Warnanya warna kategori yang sama dengan ikon di daftar transaksi, jadi
 * segmen oranye selalu berarti Makan.
 */
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
  const kategori = useKategori();
  const warna = (k: string) => tandaKategori(cariKategori(kategori, k, "expense")).warna;

  // Satu kartu dengan judul di dalamnya, seperti kartu "My wallet" di
  // Samsung Wallet: judul besar, keterangan abu, lalu isinya.
  return (
    <section className={s.blok}>
      <div className={s.blokIsi} style={{ paddingBottom: baris.length ? 4 : 20 }}>
        <h2 className={s.blokJudul}>Pengeluaran per kategori</h2>
        <p className={s.blokSub}>Rerata per bulan, 3 bulan penuh terakhir.</p>

        {error ? (
          <p className={s.bahaya} role="alert" style={{ margin: "16px 0 0" }}>
            Gagal ambil data: {error}
          </p>
        ) : baris.length > 0 ? (
          <>
            <div className={s.nominal} style={{ fontSize: 28, marginTop: 16 }}>
              {fmtIDRRingkas(total)}
            </div>
            <div className={s.bar} role="img" aria-label="Porsi pengeluaran per kategori">
              {baris.map((r) => (
                <span key={r.kategori} style={{ flex: r.nilai, background: warna(r.kategori) }} />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {!error && baris.length === 0 && (
        <Kosong ikon={ChartPie} judul="Belum ada pengeluaran di rentang ini">
          Ini cuma menghitung 3 bulan penuh terakhir, jadi bulan berjalan belum ikut.
        </Kosong>
      )}

      {baris.map((r) => (
        <div key={r.kategori} className={s.baris} style={{ minHeight: 52 }}>
          <span className={s.titik} style={{ background: warna(r.kategori) }} aria-hidden />
          <span className={s.barisTeks}>
            <span>{namaKategori(kategori, r.kategori, "expense")}</span>
          </span>
          <span className={s.redup}>{persen(r.nilai)}%</span>
          <span className={s.nominal}>{fmtIDR(r.nilai)}</span>
        </div>
      ))}
    </section>
  );
}
