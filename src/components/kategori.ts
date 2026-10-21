import {
  ArrowDownLeft,
  ArrowLeftRight,
  Banknote,
  Car,
  CircleEllipsis,
  Clapperboard,
  HeartPulse,
  Landmark,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { JenisKantong } from "@/lib/kantong";
import type { Transaction } from "@/types/transaction";

/**
 * Ikon dan warna per kategori — satu sumber untuk daftar transaksi, bar
 * komposisi, dan halaman detail, supaya "Makan" selalu oranye di mana pun
 * (seperti ikon berwadah berwarna di Pengaturan One UI).
 */
export const KATEGORI: Record<string, { ikon: LucideIcon; warna: string }> = {
  food: { ikon: Utensils, warna: "#ff9f43" },
  groceries: { ikon: ShoppingBasket, warna: "#5ecb7a" },
  transport: { ikon: Car, warna: "#3e91ff" },
  shopping: { ikon: ShoppingBag, warna: "#ff7a9c" },
  health: { ikon: HeartPulse, warna: "#ff5f5f" },
  entertainment: { ikon: Clapperboard, warna: "#bf7af0" },
  bills: { ikon: Receipt, warna: "#4fc9e0" },
  other: { ikon: CircleEllipsis, warna: "#9b9b9b" },
};

/** Ikon & warna untuk satu transaksi: pemasukan dan pindah kantong punya tanda sendiri. */
export function tandaTransaksi(t: Pick<Transaction, "type" | "category" | "status">) {
  if (t.status === "needs_review") return { ikon: KATEGORI.other.ikon, warna: "#ff5f5f" };
  if (t.type === "income") return { ikon: ArrowDownLeft, warna: "#5ecb7a" };
  if (t.type === "transfer") return { ikon: ArrowLeftRight, warna: "#3e91ff" };
  return KATEGORI[t.category] ?? KATEGORI.other;
}

/** Ikon & warna per jenis kantong. */
export const TANDA_KANTONG: Record<JenisKantong, { ikon: LucideIcon; warna: string }> = {
  bank: { ikon: Landmark, warna: "#3e91ff" },
  ewallet: { ikon: Wallet, warna: "#bf7af0" },
  cash: { ikon: Banknote, warna: "#5ecb7a" },
};
