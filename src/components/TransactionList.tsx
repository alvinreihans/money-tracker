import NextLink from "next/link";
import { tandaTransaksi } from "@/components/kategori";
import s from "@/components/ui.module.css";
import { fmtHari, fmtIDR, fmtIDRRingkas, labelKategori } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

/**
 * Daftar transaksi berkelompok ala One UI: dikelompokkan per hari dengan
 * subheader ("Hari ini", "Kemarin", tanggal), tiap baris dengan ikon berwadah
 * berwarna kategori, di dalam focus block membulat.
 *
 * Subheader membawa total pengeluaran hari itu — pertanyaan paling umum saat
 * membuka riwayat adalah "kemarin habis berapa".
 */

/**
 * Pengeluaran sengaja memakai warna teks biasa, bukan merah: belanja bukan
 * kesalahan, dan mewarnai semuanya merah membuat penanda yang sungguhan
 * penting — draft yang salah baca — jadi tidak terlihat.
 */
function kelasNominal(t: Transaction): string {
  if (t.status === "needs_review") return s.bahaya;
  if (t.type === "income") return s.masuk;
  if (t.type === "transfer") return s.pindah;
  return "";
}

function Baris({ t }: { t: Transaction }) {
  const { ikon: Ikon, warna } = tandaTransaksi(t);
  const rincian = [labelKategori(t.category), t.payment_method].filter(Boolean).join(" · ");

  return (
    <NextLink href={`/transactions/${t.id}`} className={`${s.baris} ${s.tekan}`}>
      <span
        className={s.barisIkon}
        // Wadah diwarnai tipis, ikonnya warna penuh: tetap tenang di layar gelap.
        style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }}
        aria-hidden
      >
        <Ikon size={20} />
      </span>
      <span className={s.barisTeks}>
        <span className={s.barisJudul}>{t.merchant ?? "Tanpa nama"}</span>
        <span className={s.redup}>{rincian}</span>
        {t.status === "needs_review" && <span className={`${s.lencana} ${s.lencanaBahaya}`}>Perlu dibenerin</span>}
      </span>
      <span className={`${s.nominal} ${kelasNominal(t)}`}>
        {t.type === "income" ? "+" : ""}
        {fmtIDR(Number(t.amount))}
      </span>
    </NextLink>
  );
}

export default function TransactionList({ items }: { items: Transaction[] }) {
  // Data sudah terurut menurut tanggal dari query, jadi cukup dipecah urut.
  const kelompok: { tanggal: string; isi: Transaction[] }[] = [];
  for (const t of items) {
    const akhir = kelompok[kelompok.length - 1];
    if (akhir?.tanggal === t.transaction_date) akhir.isi.push(t);
    else kelompok.push({ tanggal: t.transaction_date, isi: [t] });
  }

  return kelompok.map((k) => {
    // Draft belum punya nominal yang benar; pindah kantong bukan pengeluaran.
    const keluar = k.isi
      .filter((t) => t.type === "expense" && t.status === "confirmed")
      .reduce((n, t) => n + Number(t.amount), 0);

    return (
      <section key={k.tanggal} className={s.kelompok}>
        <h2 className={`${s.subheader} ${s.subheaderBaris}`}>
          <span>{fmtHari(k.tanggal)}</span>
          {keluar > 0 && <span className={s.subheaderNilai}>−{fmtIDRRingkas(keluar)}</span>}
        </h2>
        <div className={s.blok}>
          {k.isi.map((t) => (
            <Baris key={t.id} t={t} />
          ))}
        </div>
      </section>
    );
  });
}
