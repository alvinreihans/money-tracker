import type { BuktiTransfer } from "@/lib/arah";
import type { InfoPaylater } from "@/lib/pinjaman";
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
  /** Kantong (user_accounts) tempat uang bergerak; untuk pindah kantong: asalnya. */
  kantong_id: string | null;
  /** Hanya untuk pindah kantong: kantong tujuannya. */
  kantong_tujuan_id: string | null;
  /** Transaksi ikutan (biaya admin / cashback): id transaksi induknya. */
  induk_id: string | null;
  /** Pembayaran cicilan: rencana cicilannya dan cicilan ke berapa. */
  cicilan_id?: string | null;
  cicilan_ke?: number | null;
  /** Draft belanja paylater yang menunggu tenornya: nama penyedianya (SPEC-paylater). */
  paylater?: string | null;
  /** Draft yang sama persis dengan transaksi tercatat ini (SPEC-catat-andal). */
  duplikat_dari?: string | null;
  /** Bukti transfer yang arahnya belum dipastikan: JSON BuktiTransfer (SPEC-catat-tuntas). */
  bukti_transfer?: string | null;
  /** Kelompok budgeting pilihan transaksi ini; null = ikut kategori (SPEC-metode-budget). */
  kelompok?: string | null;
  /** Dari view: kelompok yang berlaku (pilihan transaksi atau bawaan kategori). */
  kelompok_efektif?: string | null;
  /** Bagian dari transaksi yang dipecah: id transaksi aslinya. */
  pecahan_dari?: string | null;
  /** Transfer pelengkap "Dibayar dari tujuan tabungan": id pengeluarannya (SPEC-tujuan-tabungan). */
  pelengkap_tujuan?: string | null;
  /** Struk campuran: JSON BagianPecah[] usulan AI, sampai dipecah/ditutup (SPEC-tawar-pecah). */
  usulan_pecah?: string | null;
  transaction_date: string; // ISO date: "YYYY-MM-DD"
  /** Jam transaksi (WIB), "HH:MM:SS"; opsional. Lihat SPEC-saldo-waktu.md. */
  waktu?: string | null;
  status: TransactionStatus;
  source: TransactionSource;
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
  /** Jam yang tertera/disebut, "HH:MM". */
  time: string | null;
  /** Bila jam tidak ada: bagian hari yang disebut, atau "lampau" ("tadi …"). */
  time_hint: "pagi" | "siang" | "sore" | "malam" | "lampau" | null;
  description: string | null;
  payment_method: string | null;
  /** Hanya untuk transfer: kantong tujuan, mis. "GoPay" pada "topup gopay dari bca". */
  payment_target: string | null;
  /** Hanya untuk transfer: biaya admin yang disebut. */
  fee: number | null;
  /** Hanya untuk expense: cashback yang benar-benar didapat. */
  cashback: number | null;
  /** Pinjaman dengan orang/kartu kredit (Lend & Borrow): arah & pihaknya. */
  pinjaman: { arah: "beri" | "terima_bayar" | "pinjam" | "bayar"; pihak: string } | null;
  /** Hanya expense: rencana cicilan yang dibayar (nama barang/penyedia yang disebut). */
  cicilan: string | null;
  /** Hanya expense: belanja yang DIBAYAR pakai paylater — jadi rencana cicilan, bukan pengeluaran. */
  paylater: InfoPaylater | null;
  /** Membedakan screenshot bukti bayar dari struk kertas kasir. */
  document_type: "receipt" | "payment_proof";
  /** Bukti transfer antar dua pihak: nama & bank keduanya; arahnya diputuskan aplikasi (lib/arah). */
  bukti_transfer: BuktiTransfer | null;
  /** Hanya expense: kelompok budgeting bila jelas beda dari bawaan kategorinya (SPEC-metode-budget). */
  kelompok: string | null;
  /** Hanya expense: rincian belanja campuran yang diketik user (jumlahnya = amount). */
  rincian: BagianPecah[] | null;
  /** Hanya expense dari struk: barang beda kategori, ditawarkan untuk dipecah (jumlahnya = amount). */
  usulan_pecah: BagianPecah[] | null;
}

/** Satu bagian transaksi yang dipecah (rincian ketikan atau usulan dari struk). */
export interface BagianPecah {
  amount: number;
  category: string;
  kelompok: string | null;
  description: string | null;
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
  | "statement"      // baris rekening koran (impor lama; fiturnya sudah dihapus)
  | "text";          // diketik: teks bebas atau isian manual (dulu juga pesan teks Telegram)
