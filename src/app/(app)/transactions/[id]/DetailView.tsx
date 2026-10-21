"use client";

import NextLink from "next/link";
import { Banner, Breadcrumbs, Heading, Label, PageHeader } from "@primer/react";
import DeleteTransactionButton from "@/components/DeleteTransactionButton";
import EditTransactionForm from "@/components/EditTransactionForm";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtTanggal, fmtWaktu, JENIS, labelKategori, labelSumber } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

export default function DetailView({ t }: { t: Transaction }) {
  const jenis = JENIS[t.type] ?? JENIS.expense;
  const draft = t.status === "needs_review";
  const nama = t.merchant ?? "Tanpa nama";

  // Baris kosong dilewati: label tanpa isi cuma bikin rincian terlihat bolong.
  const rincian: Array<[string, React.ReactNode]> = [
    ["Jenis", <Label key="j" variant={jenis.variant}>{jenis.label}</Label>],
    ["Kategori", labelKategori(t.category)],
    ["Metode bayar", t.payment_method],
    ["Rekening", t.account],
    ["Lawan transaksi", t.counterparty],
    ["Keterangan", t.description],
    ["Masuk lewat", labelSumber(t.source)],
    ["Dicatat", fmtWaktu(t.created_at)],
  ];

  return (
    <>
      <Breadcrumbs>
        <Breadcrumbs.Item as={NextLink} href="/riwayat">
          Riwayat
        </Breadcrumbs.Item>
        <Breadcrumbs.Item selected>{nama}</Breadcrumbs.Item>
      </Breadcrumbs>

      <PageHeader>
        <PageHeader.TitleArea>
          <PageHeader.Title className={s.nominal}>
            {t.type === "income" ? "+" : ""}
            {fmtIDR(Number(t.amount))}
          </PageHeader.Title>
        </PageHeader.TitleArea>
        <PageHeader.Description>
          {nama} · {fmtTanggal(t.transaction_date)}
        </PageHeader.Description>
        <PageHeader.Actions>
          <DeleteTransactionButton id={t.id} />
        </PageHeader.Actions>
      </PageHeader>

      {draft && (
        <Banner
          variant="warning"
          title="Perlu dibenerin"
          description="Struk atau teksnya nggak berhasil dibaca, jadi nominalnya belum benar dan belum ikut dihitung di laporan. Betulkan lewat form di bawah."
        />
      )}

      <section className={s.kotak}>
        <div className={s.kotakKepala}>
          <Heading as="h2" variant="small">
            Rincian
          </Heading>
        </div>
        <dl className={`${s.dl} ${s.kotakIsi}`}>
          {rincian
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
      </section>

      {draft && (
        <section className={s.kotak}>
          <div className={s.kotakKepala}>
            <Heading as="h2" variant="small">
              Teks yang sempat kebaca
            </Heading>
          </div>
          <div className={s.kotakIsi}>
            {t.raw_ocr_text ? (
              <pre className={s.pre}>{t.raw_ocr_text}</pre>
            ) : (
              <span className={s.redup}>Nggak ada teks yang kebaca sama sekali.</span>
            )}
          </div>
        </section>
      )}

      <EditTransactionForm tx={t} />
    </>
  );
}
