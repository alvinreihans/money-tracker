"use client";

import NextLink from "next/link";
import { useCatat } from "@/components/Catat";
import { tandaTransaksi } from "@/components/kategori";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtIDRRingkas, fmtTanggal, kelompokWaktu, labelKategori } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

/**
 * Daftar transaksi ala Voice Recorder Samsung: satu transaksi satu kartu,
 * dikelompokkan dengan subheader waktu yang makin kasar ke belakang ("Hari
 * ini", "Kemarin", "Minggu ini", nama bulan, tahun). Keterangan transaksi
 * tampil di bawah garis putus-putus di dalam kartunya, seperti ringkasan
 * rekaman.
 *
 * Subheader membawa total pengeluaran kelompoknya — pertanyaan paling umum
 * saat membuka riwayat adalah "kemarin habis berapa".
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

function Kartu({ t, kelompok }: { t: Transaction; kelompok: string }) {
  const { ikon: Ikon, warna } = tandaTransaksi(t);
  // Di "Hari ini"/"Kemarin" tanggalnya sudah jelas dari subheader.
  const tanggal = kelompok === "Hari ini" || kelompok === "Kemarin" ? null : fmtTanggal(t.transaction_date);
  const { kantong } = useCatat();
  const tujuan = t.type === "transfer" ? kantong.find((k) => k.id === t.kantong_tujuan_id)?.name : undefined;
  const lewat = tujuan ? `${t.payment_method ?? "?"} → ${tujuan}` : t.payment_method;
  // Pindah kantong tidak berkategori; arahnya sudah cukup.
  const rincian = [tanggal, t.type === "transfer" ? null : labelKategori(t.category), lewat].filter(Boolean).join(" · ");

  return (
    <NextLink href={`/transactions/${t.id}`} className={`${s.kartuTx} ${s.tekan}`}>
      <span className={s.baris}>
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
      </span>
      {t.description && <span className={s.kartuCatatan} style={{ display: "block" }}>{t.description}</span>}
    </NextLink>
  );
}

export default function TransactionList({
  items,
  kaki,
}: {
  items: Transaction[];
  /** Aksi penutup di bawah daftar, mis. "Lihat semua riwayat". */
  kaki?: React.ReactNode;
}) {
  // Data sudah terurut menurut tanggal dari query, jadi cukup dipecah urut.
  const kelompok: { label: string; isi: Transaction[] }[] = [];
  for (const t of items) {
    const label = kelompokWaktu(t.transaction_date);
    const akhir = kelompok[kelompok.length - 1];
    if (akhir?.label === label) akhir.isi.push(t);
    else kelompok.push({ label, isi: [t] });
  }

  return (
    <>
      {kelompok.map((k) => {
        // Draft belum punya nominal yang benar; pindah kantong bukan pengeluaran.
        const keluar = k.isi
          .filter((t) => t.type === "expense" && t.status === "confirmed")
          .reduce((n, t) => n + Number(t.amount), 0);

        return (
          <section key={k.label} className={s.kelompok}>
            <h2 className={`${s.subheader} ${s.subheaderTebal} ${s.subheaderBaris}`}>
              <span>{k.label}</span>
              {keluar > 0 && (
                <>
                  <span className={s.titikTitik} aria-hidden />
                  <span className={`${s.subheaderNilai} ${s.redup}`}>−{fmtIDRRingkas(keluar)}</span>
                </>
              )}
            </h2>
            {k.isi.map((t) => (
              <Kartu key={t.id} t={t} kelompok={k.label} />
            ))}
          </section>
        );
      })}
      {kaki}
    </>
  );
}
