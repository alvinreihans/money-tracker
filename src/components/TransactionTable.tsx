"use client";

import Badge from "@cloudscape-design/components/badge";
import Box, { type BoxProps } from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import { NavLink } from "@/components/ui";
import { fmtIDR, fmtTanggal, JENIS, labelKategori } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

/**
 * Daftar transaksi. Dipakai di beranda (dipotong) dan di Riwayat (penuh).
 *
 * Dua kolom saja, bukan satu kolom per atribut: di layar HP tabel lebar
 * memaksa geser ke samping, padahal yang dicari sekilas cuma "apa" dan
 * "berapa". Rinciannya ada di baris kedua dan di halaman detail.
 */

/**
 * Pengeluaran sengaja memakai warna teks biasa, bukan merah: belanja bukan
 * kesalahan, dan mewarnai semuanya merah membuat penanda yang sungguhan
 * penting — draft yang salah baca — jadi tidak terlihat.
 */
function warnaNominal(t: Transaction): BoxProps["color"] {
  if (t.status === "needs_review") return "text-status-error";
  if (t.type === "income") return "text-status-success";
  if (t.type === "transfer") return "text-status-info";
  return "inherit";
}

export default function TransactionTable({
  items,
  header,
  empty,
}: {
  items: Transaction[];
  header: React.ReactNode;
  empty: React.ReactNode;
}) {
  return (
    <Table
      variant="container"
      header={header}
      items={items}
      trackBy="id"
      wrapLines
      empty={empty}
      columnDefinitions={[
        {
          id: "transaksi",
          header: "Transaksi",
          isRowHeader: true,
          cell: (t) => {
            const jenis = JENIS[t.type] ?? JENIS.expense;
            return (
              <SpaceBetween size="xxxs">
                <NavLink href={`/transactions/${t.id}`}>{t.merchant ?? "Tanpa nama"}</NavLink>
                <Box variant="small" color="text-body-secondary">
                  {fmtTanggal(t.transaction_date)} · {labelKategori(t.category)}
                  {t.payment_method ? ` · ${t.payment_method}` : ""}
                </Box>
                <SpaceBetween direction="horizontal" size="xxs">
                  <Badge color={jenis.color}>{jenis.label}</Badge>
                  {t.status === "needs_review" && <Badge color="red">Perlu dibenerin</Badge>}
                </SpaceBetween>
              </SpaceBetween>
            );
          },
        },
        {
          id: "nominal",
          header: "Nominal",
          cell: (t) => (
            <Box textAlign="right" fontWeight="bold" color={warnaNominal(t)}>
              {t.type === "income" ? "+" : ""}
              {fmtIDR(Number(t.amount))}
            </Box>
          ),
        },
      ]}
    />
  );
}
