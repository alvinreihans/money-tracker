import { CATEGORY_LABEL } from "@/lib/format";
import type { TransactionType } from "@/types/transaction";

/**
 * Validasi transaksi yang diisi tangan: form "Isi manual" dan form edit.
 *
 * Satu fungsi untuk browser dan server. Browser memakainya supaya pesan
 * salahnya muncul tanpa bolak-balik ke server; server memakainya karena body
 * dari browser tidak bisa dipercaya.
 */

export const TIPE_TRANSAKSI: { id: TransactionType; label: string }[] = [
  { id: "expense", label: "Keluar" },
  { id: "income", label: "Masuk" },
  { id: "transfer", label: "Pindah kantong" },
];

/** Batas kolom numeric(14, 2) di tabel transactions. */
const NOMINAL_MAKS = 1_000_000_000_000;

export interface TransaksiValid {
  amount: number;
  type: TransactionType;
  category: string;
  transaction_date: string;
  merchant: string | null;
  payment_method: string | null;
  description: string | null;
}

export type HasilValidasi =
  | { ok: true; data: TransaksiValid }
  | { ok: false; error: string };

function teksOpsional(v: unknown, maks: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const bersih = v.trim();
  if (bersih.length > maks) return undefined;
  return bersih || null;
}

/** Tanggal kalender yang benar-benar ada, bukan sekadar berpola YYYY-MM-DD. */
function tanggalSah(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [t, b, h] = v.split("-").map(Number);
  const d = new Date(Date.UTC(t, b - 1, h));
  return d.getUTCFullYear() === t && d.getUTCMonth() === b - 1 && d.getUTCDate() === h;
}

export function validasiTransaksi(input: Record<string, unknown>): HasilValidasi {
  // Dari form, nominal datang sebagai string; dari JSON bisa angka.
  const amount = typeof input.amount === "string" && input.amount.trim() === ""
    ? NaN
    : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Nominalnya harus lebih dari nol." };
  }
  if (amount >= NOMINAL_MAKS) {
    return { ok: false, error: "Nominalnya kebesaran." };
  }

  const type = input.type;
  if (!TIPE_TRANSAKSI.some((t) => t.id === type)) {
    return { ok: false, error: "Jenis transaksinya nggak dikenal." };
  }

  const category = input.category;
  if (typeof category !== "string" || !(category in CATEGORY_LABEL)) {
    return { ok: false, error: "Kategorinya nggak dikenal." };
  }

  if (!tanggalSah(input.transaction_date)) {
    return { ok: false, error: "Tanggalnya nggak valid." };
  }

  const merchant = teksOpsional(input.merchant, 120);
  const payment_method = teksOpsional(input.payment_method, 60);
  const description = teksOpsional(input.description, 500);
  if (merchant === undefined || payment_method === undefined || description === undefined) {
    return { ok: false, error: "Ada isian yang kepanjangan." };
  }

  return {
    ok: true,
    data: {
      // Rupiah tanpa sen di UI; dibulatkan supaya 25000.004 tidak tersimpan.
      amount: Math.round(amount * 100) / 100,
      type: type as TransactionType,
      category,
      transaction_date: input.transaction_date,
      merchant,
      payment_method,
      description,
    },
  };
}

/** Teks bebas untuk tab "Ketik". Batasnya menjaga prompt Groq tetap kecil. */
export const TEKS_MAKS = 500;

/**
 * Teks cari Riwayat yang aman dimasukkan ke filter or() PostgREST: koma,
 * kurung, titik dua, tanda kutip, garis miring terbalik, dan wildcard punya
 * arti di sintaksnya, jadi diganti spasi supaya teks cari tidak bisa
 * membelokkan query.
 */
export function bersihkanCari(teks: string | undefined): string {
  return (teks ?? "").replace(/[,()%*\\:"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
}
