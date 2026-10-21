"use client";

import NextLink from "next/link";
import { Label, Link, Stack } from "@primer/react";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtTanggal, JENIS, labelKategori } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

/**
 * Baris-baris transaksi, seperti daftar issue GitHub. Dipakai di beranda
 * (dipotong) dan di Riwayat (penuh); bingkai dan judulnya milik pemanggil.
 *
 * Pengeluaran sengaja memakai warna teks biasa, bukan merah: belanja bukan
 * kesalahan, dan mewarnai semuanya merah membuat penanda yang sungguhan
 * penting — draft yang salah baca — jadi tidak terlihat.
 */
function kelasNominal(t: Transaction): string {
  if (t.status === "needs_review") return s.draft;
  if (t.type === "income") return s.masuk;
  if (t.type === "transfer") return s.pindah;
  return "";
}

export default function TransactionList({ items }: { items: Transaction[] }) {
  return items.map((t) => {
    const jenis = JENIS[t.type] ?? JENIS.expense;
    return (
      <div key={t.id} className={s.baris}>
        <div className={s.barisIsi}>
          <Link as={NextLink} href={`/transactions/${t.id}`}>
            {t.merchant ?? "Tanpa nama"}
          </Link>
          <span className={s.redup}>
            {fmtTanggal(t.transaction_date)} · {labelKategori(t.category)}
            {t.payment_method ? ` · ${t.payment_method}` : ""}
          </span>
          <Stack direction="horizontal" gap="condensed" wrap="wrap">
            <Label variant={jenis.variant}>{jenis.label}</Label>
            {t.status === "needs_review" && <Label variant="danger">Perlu dibenerin</Label>}
          </Stack>
        </div>
        <span className={`${s.nominal} ${kelasNominal(t)}`}>
          {t.type === "income" ? "+" : ""}
          {fmtIDR(Number(t.amount))}
        </span>
      </div>
    );
  });
}
