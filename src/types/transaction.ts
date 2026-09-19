// Tipe domain bersama (single source of truth) untuk seluruh app.

/** transfer = uang pindah antar rekening sendiri, BUKAN pengeluaran. */
export type TransactionType = "income" | "expense" | "transfer";

/** Hasil pipeline ekstraksi: lolos validasi, atau perlu koreksi manual. */
export type TransactionStatus = "confirmed" | "needs_review";

/** Baris penuh sesuai tabel `transactions` di database. */
export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: TransactionType;
  category: string;
  merchant: string | null;
  description: string | null;
  payment_method: string | null;
  transaction_date: string; // ISO date: "YYYY-MM-DD"
  status: TransactionStatus;
  /** Rekening/dompet tempat uang bergerak, mis. "SeaBank". */
  account: string | null;
  /** Lawan transaksi menurut rekening koran, mis. "ShopeePay". */
  counterparty: string | null;
  source: TransactionSource;
  /** Kunci idempoten untuk baris rekening koran. */
  external_id: string | null;
  /** Teks OCR mentah, hanya terisi saat status = "needs_review". */
  raw_ocr_text: string | null;
  created_at: string; // ISO timestamptz
}

/** Payload hasil pipeline ekstraksi dari struk/teks (belum ada id/user_id). */
export interface ExtractedReceipt {
  amount: number;
  type: TransactionType;
  merchant: string | null;
  category: string;
  transaction_date: string; // "YYYY-MM-DD"
  description: string | null;
  payment_method: string | null;
  /** Membedakan screenshot bukti bayar dari struk kertas kasir. */
  document_type: "receipt" | "payment_proof";
}

/** Bentuk baris yang dikembalikan RPC get_avg_monthly_expense_by_category(). */
export interface AvgMonthlyExpenseRow {
  category: string;
  avg_monthly: number;
  total_3m: number;
  months_active: number;
}

/** Dari mana transaksi ini berasal. */
export type TransactionSource =
  | "receipt"        // foto struk kertas
  | "payment_proof"  // screenshot bukti bayar e-wallet
  | "statement"      // baris rekening koran
  | "text";          // pesan teks di Telegram

/** Rekening atau dompet milik user; dipakai untuk mengenali transfer internal. */
export interface UserAccount {
  id: string;
  user_id: string;
  name: string;
  kind: "bank" | "ewallet" | "cash";
  aliases: string[];
}

/** Satu baris transaksi hasil parsing rekening koran. */
export interface StatementLine {
  transaction_date: string; // "YYYY-MM-DD"
  description: string;
  counterparty: string | null;
  amount: number;
  type: TransactionType;
  category: string;
  payment_method: string | null;
}
