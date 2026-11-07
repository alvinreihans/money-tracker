/**
 * Impor rekening koran (docs/specs/SPEC-impor-rekening.md): bentuk data
 * bersama semua parser. Semua fungsi di src/lib/rekening/ murni (tanpa
 * database, tanpa AI) — diuji di scripts/uji-rekening.mts.
 */

/** Satu potongan teks PDF dengan posisinya (titik PDF, kiri-bawah = 0). */
export interface Potongan {
  x: number;
  s: string;
}

/** Satu baris teks PDF: potongan-potongan dengan y yang sama, urut kiri → kanan. */
export interface BarisPdf {
  halaman: number;
  y: number;
  items: Potongan[];
  teks: string;
}

export type Bank = "seabank" | "jago" | "bri";
export type FormatRekening = "seabank" | "jagoBulanan" | "jagoRiwayat" | "bri";

export const NAMA_BANK: Record<Bank, string> = { seabank: "SeaBank", jago: "Jago", bri: "BRI" };

/** Pihak lawan transaksi menurut bank. */
export interface Pihak {
  nama: string | null;
  /** Nama bank/e-wallet lawan ("JAGO", "ShopeePay", "Dana"). */
  bank: string | null;
  /** Nomor rekening/HP lawan bila tertulis (lengkap, hanya untuk mengenali rekening sendiri). */
  nomor: string | null;
}

/** Satu baris rekening koran, sudah seragam untuk semua bank. */
export interface BarisBank {
  /** "YYYY-MM-DD" */
  tanggal: string;
  /** "HH:MM" atau "HH:MM:SS" (WIB); null bila bank tidak mencantumkan (SeaBank). */
  jam: string | null;
  /** Bertanda: masuk +, keluar −. */
  nominal: number;
  /** Saldo sesudah baris ini, bila tertulis. */
  saldo: number | null;
  /** Uraian ringkas apa adanya dari bank (tanpa pengenal). */
  uraian: string;
  /** Jenis menurut bank: SeaBank "Payment"/"Interest"/…, Jago "Transfer Keluar"/…; BRI null. */
  jenis: string | null;
  pihak: Pihak | null;
  /** Catatan dari pengirim/penerima (Jago). */
  catatan: string | null;
  /** Pengenal unik per user (`ref_bank`), stabil antar-impor dan antar-format. */
  ref: string;
  /** Urutan di rekening koran (mulai 0), untuk rekening tanpa jam. */
  urut: number;
}

/** Satu rekening / kantong Jago di dalam satu PDF. */
export interface RekeningBank {
  bank: Bank;
  /** 4 digit akhir nomor rekening (Jago: nomor kantong Jago-nya). */
  nomorAkhir: string;
  /** Kantong Jago (bulanan & riwayat): "Kantong Utama", "Dana Darurat", …; selain itu null. */
  saku: string | null;
  /** Kantong utama rekening ini (selain Jago selalu true). */
  utama: boolean;
  /** Periode "YYYY-MM-DD" (inklusif). */
  dari: string;
  sampai: string;
  saldoAwal: number;
  saldoAkhir: number;
  baris: BarisBank[];
}

/** Deposito yang tertulis di rekening koran (SeaBank). */
export interface DepositoBank {
  nama: string;
  /** Pengenal deposito dari bank, mis. "TD…"; null bila tidak ada. */
  kode: string | null;
  tenor: number;
  satuan: "hari" | "bulan";
  /** "YYYY-MM-DD" */
  jatuhTempo: string;
  /** % per tahun */
  bunga: number;
  pokok: number;
}

export interface HasilBaca {
  format: FormatRekening;
  bank: Bank;
  /** Nama pemilik rekening (untuk mengenali transfer ke diri sendiri). */
  pemilik: string | null;
  rekening: RekeningBank[];
  deposito: DepositoBank[];
}

/** Rekening koran tidak bisa dibaca; `pesan` siap ditampilkan. */
export class GalatRekening extends Error {}

export const PESAN_BANK_LAIN = "Rekening koran dari bank ini belum bisa dibaca.";
