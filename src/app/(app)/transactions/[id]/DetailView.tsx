"use client";

import { useCatat } from "@/components/Catat";
import DeleteTransactionButton from "@/components/DeleteTransactionButton";
import EditTransactionForm from "@/components/EditTransactionForm";
import { tandaTransaksi } from "@/components/kategori";
import { AppBar, Pesan } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtTanggal, fmtWaktu, JENIS, labelKategori, labelSumber } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

export default function DetailView({ t }: { t: Transaction }) {
  const draft = t.status === "needs_review";
  const nama = t.merchant ?? "Tanpa nama";
  const { ikon: Ikon, warna } = tandaTransaksi(t);
  const { kantong } = useCatat();
  const pindah = t.type === "transfer";

  // Baris kosong dilewati: label tanpa isi cuma bikin rincian terlihat bolong.
  const rincian = [
    ["Jenis", JENIS[t.type]],
    ["Kategori", labelKategori(t.category)],
    [pindah ? "Dari kantong" : "Kantong", t.payment_method],
    ["Ke kantong", pindah ? kantong.find((k) => k.id === t.kantong_tujuan_id)?.name : null],
    ["Rekening", t.account],
    ["Lawan transaksi", t.counterparty],
    ["Keterangan", t.description],
    ["Masuk lewat", labelSumber(t.source)],
    ["Dicatat", fmtWaktu(t.created_at)],
  ].filter(([, v]) => v);

  return (
    <>
      <AppBar
        kembali="/riwayat"
        judul={`${t.type === "income" ? "+" : ""}${fmtIDR(Number(t.amount))}`}
        judulKecil={nama}
        sub={`${nama} · ${fmtTanggal(t.transaction_date)}`}
        aksi={<DeleteTransactionButton id={t.id} />}
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
            aksi={<EditTransactionForm tx={t} />}
          >
            Struk atau teksnya nggak berhasil dibaca, jadi nominalnya belum benar dan belum ikut
            dihitung di laporan.
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

        {draft && (
          <>
            <h2 className={s.subheader}>Teks yang sempat kebaca</h2>
            <div className={`${s.blok} ${s.blokIsi}`}>
              {t.raw_ocr_text ? (
                <pre className={s.pre}>{t.raw_ocr_text}</pre>
              ) : (
                <span className={s.redup}>Nggak ada teks yang kebaca sama sekali.</span>
              )}
            </div>
          </>
        )}

        {!draft && <EditTransactionForm tx={t} />}
      </div>
    </>
  );
}
