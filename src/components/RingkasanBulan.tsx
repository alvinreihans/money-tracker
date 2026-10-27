import NextLink from "next/link";
import { ChevronRight } from "lucide-react";
import s from "@/components/ui.module.css";
import { fmtIDRRingkas } from "@/lib/format";

/**
 * Keluar, masuk, dan selisih satu bulan (tab Analitik), dengan perubahan
 * keluar dari bulan sebelumnya. Keluar & Masuk membuka Riwayat yang sudah
 * tersaring. Arah perubahan ditulis dengan teks, bukan warna saja.
 */
export default function RingkasanBulan({
  keluar,
  masuk,
  perubahan,
  bulanLalu,
  hrefKeluar,
  hrefMasuk,
  dariTujuan,
}: {
  keluar: number;
  masuk: number;
  /** % perubahan keluar dari bulan lalu; null = bulan lalu kosong. */
  perubahan?: number | null;
  /** "September" */
  bulanLalu?: string;
  hrefKeluar?: string;
  hrefMasuk?: string;
  /** Pembelian dari tujuan tabungan, di luar Keluar (SPEC-analitik-tujuan). */
  dariTujuan?: { total: number; nama: string; href: string } | null;
}) {
  const selisih = masuk - keluar;
  const baris = (label: React.ReactNode, nilai: React.ReactNode, href?: string) =>
    href ? (
      <NextLink href={href} className={`${s.statBaris} ${s.tekan}`} style={{ color: "inherit" }}>
        {label}
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {nilai}
          <ChevronRight size={18} color="var(--teks-2)" aria-hidden />
        </span>
      </NextLink>
    ) : (
      <div className={s.statBaris}>
        {label}
        {nilai}
      </div>
    );

  return (
    <section className={s.blok} aria-label="Ringkasan bulan">
      {baris(
        <span>
          Keluar
          {perubahan != null && perubahan !== 0 && bulanLalu && (
            <>
              <br />
              <span className={s.redup}>
                {perubahan > 0 ? "↑ naik" : "↓ turun"} {Math.abs(perubahan)}% dari {bulanLalu}
              </span>
            </>
          )}
        </span>,
        <span className={s.nominal}>{fmtIDRRingkas(keluar)}</span>,
        hrefKeluar,
      )}
      {dariTujuan &&
        baris(
          <span>
            Dari tujuan tabungan
            <br />
            <span className={s.redup}>{dariTujuan.nama}</span>
          </span>,
          <span className={s.nominal}>{fmtIDRRingkas(dariTujuan.total)}</span>,
          dariTujuan.href,
        )}
      {baris(<span>Masuk</span>, <span className={`${s.nominal} ${masuk > 0 ? s.masuk : ""}`}>{fmtIDRRingkas(masuk)}</span>, hrefMasuk)}
      {baris(
        <span>
          Selisih
          <br />
          <span className={s.redup}>{selisih >= 0 ? "Masih surplus" : "Lebih besar pasak"}</span>
        </span>,
        <span className={`${s.nominal} ${selisih < 0 ? s.bahaya : s.masuk}`}>
          {selisih < 0 ? "−" : ""}
          {fmtIDRRingkas(Math.abs(selisih))}
        </span>,
      )}
    </section>
  );
}
