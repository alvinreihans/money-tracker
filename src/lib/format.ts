import type { TransactionType } from "@/types/transaction";

/** Formatter tampilan, dipakai bersama daftar dan halaman detail. */

export const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * Nominal untuk stat tile. Ringkas hanya kalau memang besar — "Rp 34 rb"
 * malah lebih sulit dibaca sekilas daripada "Rp 34.000".
 */
export const fmtIDRRingkas = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n)
    : fmtIDR(n);

/** Tanggal lokal sebagai YYYY-MM-DD. toISOString() menggeser hari di UTC+7. */
export const isoLokal = (d: Date) => {
  const bulan = String(d.getMonth() + 1).padStart(2, "0");
  const hari = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${bulan}-${hari}`;
};

export const namaBulan = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { month: "long" }).format(d);

export const fmtTanggal = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));

export const fmtWaktu = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export const TYPE_BADGE: Record<TransactionType, { label: string; cls: string }> = {
  expense: { label: "Keluar", cls: "bg-amber-50 text-amber-700" },
  income: { label: "Masuk", cls: "bg-emerald-50 text-emerald-700" },
  transfer: { label: "Pindah kantong", cls: "bg-sky-50 text-sky-700" },
};

/** Kategori disimpan sebagai slug Inggris; yang dilihat user harus Indonesia. */
export const CATEGORY_LABEL: Record<string, string> = {
  food: "Makan",
  groceries: "Belanja harian",
  transport: "Transportasi",
  shopping: "Belanja",
  health: "Kesehatan",
  entertainment: "Hiburan",
  bills: "Tagihan",
  other: "Lainnya",
};

export const labelKategori = (slug: string) => CATEGORY_LABEL[slug] ?? slug;

/** Dari mana transaksi ini masuk — dijelaskan dengan bahasa user, bukan slug. */
export const SOURCE_LABEL: Record<string, string> = {
  receipt: "Foto struk",
  payment_proof: "Bukti pembayaran",
  statement: "Rekening koran",
  text: "Diketik manual",
};

export const labelSumber = (slug: string) => SOURCE_LABEL[slug] ?? slug;
