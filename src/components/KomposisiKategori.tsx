"use client";

import NextLink from "next/link";
import { ChartPie, ChevronRight } from "lucide-react";
import { useKategori } from "@/components/Catat";
import { tandaKategori } from "@/components/kategori";
import { Kosong } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtIDRRingkas } from "@/lib/format";
import { cariKategori, namaKategori } from "@/lib/kategori";
import type { AnalisisBulan } from "@/lib/analitik";

/**
 * Pengeluaran per kategori di bulan terpilih (SPEC-analitik-insight): satu
 * bar bersegmen plus daftar dengan porsi dan perubahan dari bulan lalu.
 * Tiap baris membuka Riwayat yang sudah tersaring ke kategori & bulan itu.
 *
 * Warnanya warna kategori yang sama dengan ikon di daftar transaksi, jadi
 * segmen oranye selalu berarti Makan.
 */
export default function KomposisiKategori({
  data,
  total,
  bulanLalu,
  href,
}: {
  data: AnalisisBulan["kategori"];
  total: number;
  /** "September" */
  bulanLalu: string;
  href: (kategori: string) => string;
}) {
  const kategori = useKategori();
  // Nama bulan pendek ("Sep"): baris kategori sempit di HP.
  const lalu = bulanLalu.slice(0, 3);
  const warna = (k: string) => tandaKategori(cariKategori(kategori, k, "expense")).warna;

  return (
    <section className={s.blok}>
      <div className={s.blokIsi} style={{ paddingBottom: data.length ? 4 : 20 }}>
        <h2 className={s.blokJudul}>Pengeluaran per kategori</h2>
        {data.length > 0 && (
          <>
            <div className={s.nominal} style={{ fontSize: 28, marginTop: 12 }}>
              {fmtIDRRingkas(total)}
            </div>
            <div className={s.bar} role="img" aria-label="Porsi pengeluaran per kategori">
              {data.map((r) => (
                <span key={r.kategori} style={{ flex: r.total, background: warna(r.kategori) }} />
              ))}
            </div>
          </>
        )}
      </div>

      {data.length === 0 && <Kosong ikon={ChartPie} judul="Belum ada pengeluaran di bulan ini" />}

      {data.map((r) => (
        <NextLink key={r.kategori} href={href(r.kategori)} className={`${s.baris} ${s.tekan}`} style={{ minHeight: 56 }}>
          <span className={s.titik} style={{ background: warna(r.kategori) }} aria-hidden />
          <span className={s.barisTeks}>
            <span>{namaKategori(kategori, r.kategori, "expense")}</span>
            <span className={s.redup}>
              {r.porsi}% ·{" "}
              {r.perubahan == null ? "baru" : r.perubahan === 0 ? `sama dengan ${lalu}` : `${r.perubahan > 0 ? "↑" : "↓"} ${Math.abs(r.perubahan)}% dari ${lalu}`}
            </span>
          </span>
          <span className={s.nominal}>{fmtIDR(r.total)}</span>
          <ChevronRight size={18} color="var(--teks-2)" aria-hidden />
        </NextLink>
      ))}
    </section>
  );
}
