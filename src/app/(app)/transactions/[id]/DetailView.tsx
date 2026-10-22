"use client";

import { useCatat, useKategori } from "@/components/Catat";
import DeleteTransactionButton from "@/components/DeleteTransactionButton";
import EditTransactionForm from "@/components/EditTransactionForm";
import { tandaTransaksi } from "@/components/kategori";
import { AppBar, Pesan } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { alasanDraft } from "@/lib/kantong";
import { namaKategori } from "@/lib/kategori";
import { fmtIDR, fmtTanggal, fmtWaktu, JENIS, labelSumber } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

export default function DetailView({
  t,
  ikutan,
  kembali,
}: {
  t: Transaction;
  ikutan: { id: string; amount: number } | null;
  /** Halaman asal (Beranda / Riwayat dengan filternya), tujuan kembali & setelah hapus. */
  kembali: string;
}) {
  const draft = t.status === "needs_review";
  const alasan = alasanDraft(t);
  const nama = t.merchant ?? "Tanpa nama";
  const kategori = useKategori();
  const { ikon: Ikon, warna } = tandaTransaksi(t, kategori);
  const { kantong } = useCatat();
  const pindah = t.type === "transfer";

  // Baris kosong dilewati: label tanpa isi cuma bikin rincian terlihat bolong.
  const rincian = [
    ["Jenis", JENIS[t.type]],
    ["Kategori", pindah ? null : namaKategori(kategori, t.category, t.type)],
    // Tanpa kantong tertaut, teksnya cuma metode bayar yang disebut, belum tentu kantong.
    [t.kantong_id ? (pindah ? "Dari kantong" : "Kantong") : "Metode bayar", t.payment_method],
    ["Ke kantong", pindah ? kantong.find((k) => k.id === t.kantong_tujuan_id)?.name : null],
    [pindah ? "Biaya admin" : "Cashback", ikutan ? fmtIDR(ikutan.amount) : null],
    ["Rekening", t.account],
    ["Lawan transaksi", t.counterparty],
    ["Keterangan", t.description],
    ["Masuk lewat", labelSumber(t.source)],
    ["Dicatat", fmtWaktu(t.created_at)],
  ].filter(([, v]) => v);

  return (
    <>
      <AppBar
        kembali={kembali}
        judul={`${t.type === "income" ? "+" : ""}${fmtIDR(Number(t.amount))}`}
        judulKecil={nama}
        sub={`${nama} · ${fmtTanggal(t.transaction_date)}`}
        aksi={<DeleteTransactionButton id={t.id} kembali={kembali} />}
        ikon={
          <span
            className={s.ikonBesar}
            style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }}
            aria-hidden
          >
            <Ikon size={30} />
          </span>
        }
      />

      <div className={s.isi}>
        {draft && (
          <Pesan
            jenis="peringatan"
            judul="Perlu dibenerin"
            aksi={<EditTransactionForm tx={t} ikutan={ikutan} />}
          >
            {alasan === "kantong"
              ? t.payment_method
                ? `Nggak ada kantong yang cocok dengan “${t.payment_method}”. Pilih kantongnya dulu; sampai itu transaksi ini belum ikut dihitung.`
                : "Kantongnya nggak disebut. Pilih kantongnya dulu; sampai itu transaksi ini belum ikut dihitung."
              : "Struk atau teksnya nggak berhasil dibaca, jadi nominalnya belum benar dan belum ikut dihitung di laporan."}
          </Pesan>
        )}

        <dl className={s.blok} style={{ margin: 0 }}>
          {rincian.map(([k, v]) => (
            <div key={k} className={s.statBaris}>
              <dt className={s.redup}>{k}</dt>
              <dd style={{ margin: 0, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{v}</dd>
            </div>
          ))}
        </dl>

        {draft && (alasan === "baca" || t.raw_ocr_text) && (
          <>
            <h2 className={s.subheader}>{alasan === "kantong" ? "Teks aslinya" : "Teks yang sempat kebaca"}</h2>
            <div className={`${s.blok} ${s.blokIsi}`}>
              {t.raw_ocr_text ? (
                <pre className={s.pre}>{t.raw_ocr_text}</pre>
              ) : (
                <span className={s.redup}>Nggak ada teks yang kebaca sama sekali.</span>
              )}
            </div>
          </>
        )}

        {!draft && <EditTransactionForm tx={t} ikutan={ikutan} />}
      </div>
    </>
  );
}
