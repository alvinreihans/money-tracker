import { JENIS } from "@/lib/format";
import type { TransactionType } from "@/types/transaction";

/**
 * Ekspor semua transaksi sebagai CSV (cadangan data milik user). Fungsi
 * murni — diuji di scripts/uji-ekspor.mts; route-nya /api/ekspor.
 */

type Sel = string | number | null | undefined;

/**
 * Satu sel CSV. Teks berawalan = + - @ (atau tab/CR) diberi ' supaya tidak
 * dijalankan sebagai rumus oleh Excel/Sheets — merchant & keterangan bisa
 * berasal dari struk atau ketikan siapa saja.
 */
export function selCsv(v: Sel): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  const aman = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(aman) ? `"${aman.replace(/"/g, '""')}"` : aman;
}

/** BOM di depan supaya Excel membaca UTF-8 (emoji, huruf non-ASCII). */
export const keCsv = (baris: Sel[][]) => "﻿" + baris.map((b) => b.map(selCsv).join(",")).join("\r\n") + "\r\n";

export interface BarisEkspor {
  transaction_date: string;
  waktu: string | null;
  created_at: string;
  type: TransactionType;
  category: string;
  amount: number | string;
  merchant: string | null;
  description: string | null;
  kantong_id: string | null;
  kantong_tujuan_id: string | null;
  payment_method: string | null;
  status: string;
}

export const KOLOM_EKSPOR =
  "transaction_date, waktu, created_at, type, category, amount, merchant, description, kantong_id, kantong_tujuan_id, payment_method, status";

/** Baris tabel siap-CSV: nama kantong & kategori, bukan id/slug; waktu catat dalam WIB. */
export function tabelEkspor(
  transaksi: BarisEkspor[],
  kantong: { id: string; name: string }[],
  kategori: { type: string; slug: string; name: string }[],
): Sel[][] {
  const namaKantong = new Map(kantong.map((k) => [k.id, k.name]));
  const namaKategori = new Map(kategori.map((k) => [`${k.type}:${k.slug}`, k.name]));
  return [
    ["Tanggal", "Jam", "Jenis", "Kategori", "Nominal", "Merchant", "Keterangan", "Kantong", "Kantong tujuan", "Metode bayar", "Status", "Dicatat (WIB)"],
    ...transaksi.map((t) => [
      t.transaction_date,
      t.waktu?.slice(0, 5) ?? "",
      JENIS[t.type] ?? t.type,
      namaKategori.get(`${t.type}:${t.category}`) ?? t.category,
      Number(t.amount),
      t.merchant,
      t.description,
      t.kantong_id ? (namaKantong.get(t.kantong_id) ?? "") : "",
      t.kantong_tujuan_id ? (namaKantong.get(t.kantong_tujuan_id) ?? "") : "",
      t.payment_method,
      t.status === "needs_review" ? "Belum selesai" : "Tercatat",
      new Date(t.created_at).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).slice(0, 16),
    ]),
  ];
}
