import { KATEGORI_KELUAR, kategoriUntuk } from "@/lib/format";
import { JENIS_KANTONG, type JenisKantong } from "@/lib/kantong";
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
  kantong_id: string | null;
  kantong_tujuan_id: string | null;
  description: string | null;
  /** Hanya pindah kantong. Bukan kolom: jadi transaksi ikutan (barisIkutan). */
  biaya_admin: number | null;
  /** Hanya pengeluaran. Bukan kolom: jadi transaksi ikutan (barisIkutan). */
  cashback: number | null;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id kantong: kosong → null, bukan uuid → undefined (ditolak). */
function idOpsional(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "string" && UUID.test(v) ? v : undefined;
}

/** Nominal pelengkap (biaya admin, cashback): kosong/0 → null, salah → undefined. */
function nominalOpsional(v: unknown): number | null | undefined {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= NOMINAL_MAKS) return undefined;
  return n === 0 ? null : Math.round(n);
}

/** Tanggal kalender yang benar-benar ada, bukan sekadar berpola YYYY-MM-DD. */
function tanggalSah(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [t, b, h] = v.split("-").map(Number);
  const d = new Date(Date.UTC(t, b - 1, h));
  return d.getUTCFullYear() === t && d.getUTCMonth() === b - 1 && d.getUTCDate() === h;
}

/**
 * `wajibKantong`: user sudah punya kantong, jadi tiap transaksi harus jelas
 * kantongnya (dan tujuannya, untuk pindah kantong).
 */
export function validasiTransaksi(input: Record<string, unknown>, { wajibKantong = false } = {}): HasilValidasi {
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

  // Pengeluaran dan pemasukan punya daftar kategori sendiri; pindah kantong
  // tidak berkategori.
  const category = type === "transfer" ? "other" : input.category;
  if (typeof category !== "string" || !(category in kategoriUntuk(type as TransactionType))) {
    return { ok: false, error: "Kategorinya nggak cocok dengan jenis transaksinya." };
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

  const kantong_id = idOpsional(input.kantong_id);
  // Kantong tujuan hanya bermakna untuk pindah kantong.
  const kantong_tujuan_id = type === "transfer" ? idOpsional(input.kantong_tujuan_id) : null;
  if (kantong_id === undefined || kantong_tujuan_id === undefined) {
    return { ok: false, error: "Kantongnya nggak dikenal." };
  }
  if (wajibKantong && !kantong_id) {
    return { ok: false, error: type === "transfer" ? "Pilih kantong asalnya dulu." : "Pilih kantongnya dulu." };
  }
  if (wajibKantong && type === "transfer" && !kantong_tujuan_id) {
    return { ok: false, error: "Pilih kantong tujuannya dulu." };
  }
  if (kantong_id && kantong_id === kantong_tujuan_id) {
    return { ok: false, error: "Pilih kantong tujuan yang lain." };
  }

  const biaya_admin = type === "transfer" ? nominalOpsional(input.biaya_admin) : null;
  const cashback = type === "expense" ? nominalOpsional(input.cashback) : null;
  if (biaya_admin === undefined) return { ok: false, error: "Biaya adminnya harus angka." };
  if (cashback === undefined) return { ok: false, error: "Cashback-nya harus angka." };
  if (cashback && cashback > amount) return { ok: false, error: "Cashback-nya maksimal sebesar nominal belanjanya." };

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
      kantong_id,
      kantong_tujuan_id,
      description,
      biaya_admin,
      cashback,
    },
  };
}

/**
 * Transaksi "ikutan" yang menempel pada induknya lewat kolom induk_id: biaya
 * admin pindah kantong dicatat sebagai pengeluaran dari kantong asal, cashback
 * belanja sebagai pemasukan ke kantong yang sama. Dengan begitu keduanya
 * otomatis ikut ringkasan, budget, grafik, dan saldo, dan ikut terhapus
 * bersama induknya. Null kalau tidak ada yang perlu dicatat.
 */
export function barisIkutan(
  induk: {
    id: string;
    user_id: string;
    type: string;
    transaction_date: string;
    kantong_id: string | null;
    payment_method: string | null;
    merchant: string | null;
    status: string;
    source: string;
  },
  { biaya_admin, cashback }: { biaya_admin?: number | null; cashback?: number | null },
  namaTujuan?: string | null,
): Record<string, unknown> | null {
  const sama = {
    user_id: induk.user_id,
    transaction_date: induk.transaction_date,
    kantong_id: induk.kantong_id,
    kantong_tujuan_id: null,
    payment_method: induk.payment_method,
    status: induk.status,
    source: induk.source,
    raw_ocr_text: null,
    induk_id: induk.id,
  };
  if (induk.type === "transfer" && biaya_admin) {
    return {
      ...sama,
      type: "expense",
      category: "fees",
      amount: biaya_admin,
      merchant: "Biaya admin",
      description: namaTujuan ? `Pindah ke ${namaTujuan}` : "Pindah kantong",
    };
  }
  if (induk.type === "expense" && cashback) {
    return {
      ...sama,
      type: "income",
      category: "refund",
      amount: cashback,
      merchant: "Cashback",
      description: induk.merchant ? `Dari belanja di ${induk.merchant}` : null,
    };
  }
  return null;
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

export type HasilBudget =
  | { ok: true; simpan: { category: string; amount: number }[]; hapus: string[] }
  | { ok: false; error: string };

/** Isian Pengaturan → Budget: yang berisi disimpan, yang dikosongkan dihapus targetnya. */
export function rapikanBudget(isian: Record<string, string>): HasilBudget {
  const simpan: { category: string; amount: number }[] = [];
  const hapus: string[] = [];
  for (const [category, teks] of Object.entries(isian)) {
    const label = KATEGORI_KELUAR[category];
    if (!label) return { ok: false, error: "Kategorinya nggak dikenal." };
    if (teks.trim() === "") {
      hapus.push(category);
      continue;
    }
    const n = Number(teks);
    if (!Number.isFinite(n) || n < 1) return { ok: false, error: `Budget ${label} harus lebih dari nol.` };
    if (n >= NOMINAL_MAKS) return { ok: false, error: `Budget ${label} kebesaran.` };
    simpan.push({ category, amount: Math.round(n) });
  }
  return { ok: true, simpan, hapus };
}

export type HasilKantong =
  | { ok: true; data: { name: string; kind: JenisKantong; saldo_awal: number; saldo_per: string } }
  | { ok: false; error: string };

/** Isian tambah/ubah kantong. Saldo awal boleh minus (paylater, kartu kredit). */
export function validasiKantong(input: Record<string, unknown>): HasilKantong {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "Namanya diisi dulu." };
  if (name.length > 40) return { ok: false, error: "Namanya kepanjangan, maksimal 40 huruf." };

  const kind = input.kind;
  if (!JENIS_KANTONG.some((j) => j.id === kind)) return { ok: false, error: "Jenis kantongnya nggak dikenal." };

  const mentah = typeof input.saldo_awal === "string" ? input.saldo_awal.trim() : input.saldo_awal;
  const saldo_awal = mentah === "" || mentah === undefined || mentah === null ? 0 : Number(mentah);
  if (!Number.isFinite(saldo_awal)) return { ok: false, error: "Saldo awalnya harus angka." };
  if (Math.abs(saldo_awal) >= NOMINAL_MAKS) return { ok: false, error: "Saldo awalnya kebesaran." };

  if (!tanggalSah(input.saldo_per)) return { ok: false, error: "Tanggal saldonya nggak valid." };

  return {
    ok: true,
    data: { name, kind: kind as JenisKantong, saldo_awal: Math.round(saldo_awal), saldo_per: input.saldo_per },
  };
}
