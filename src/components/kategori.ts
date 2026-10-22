import {
  ArrowDownLeft,
  ArrowLeftRight,
  Baby,
  BadgePercent,
  Book,
  Briefcase,
  Bus,
  Car,
  CircleEllipsis,
  Clapperboard,
  Coffee,
  Coins,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  House,
  Laptop,
  Music,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store,
  TrendingUp,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cariKategori, type Kategori, type KUNCI_IKON } from "@/lib/kategori";
import type { Transaction } from "@/types/transaction";

/** Kunci ikon kategori (disimpan di database) → komponen ikonnya. */
export const IKON_KATEGORI: Record<(typeof KUNCI_IKON)[number], LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  "shopping-basket": ShoppingBasket,
  "shopping-bag": ShoppingBag,
  shirt: Shirt,
  car: Car,
  bus: Bus,
  fuel: Fuel,
  plane: Plane,
  home: House,
  zap: Zap,
  wifi: Wifi,
  smartphone: Smartphone,
  receipt: Receipt,
  coins: Coins,
  "heart-pulse": HeartPulse,
  pill: Pill,
  dumbbell: Dumbbell,
  clapperboard: Clapperboard,
  gamepad: Gamepad2,
  music: Music,
  book: Book,
  "graduation-cap": GraduationCap,
  baby: Baby,
  "paw-print": PawPrint,
  gift: Gift,
  "heart-handshake": HeartHandshake,
  briefcase: Briefcase,
  sparkles: Sparkles,
  store: Store,
  laptop: Laptop,
  "badge-percent": BadgePercent,
  "trending-up": TrendingUp,
  "piggy-bank": PiggyBank,
  wrench: Wrench,
  "circle-ellipsis": CircleEllipsis,
};

/** Nama ikon untuk pembaca layar. */
export const NAMA_IKON: Record<(typeof KUNCI_IKON)[number], string> = {
  utensils: "Sendok garpu",
  coffee: "Kopi",
  "shopping-basket": "Keranjang belanja",
  "shopping-bag": "Tas belanja",
  shirt: "Baju",
  car: "Mobil",
  bus: "Bus",
  fuel: "Bensin",
  plane: "Pesawat",
  home: "Rumah",
  zap: "Listrik",
  wifi: "Wi-Fi",
  smartphone: "HP",
  receipt: "Struk",
  coins: "Koin",
  "heart-pulse": "Kesehatan",
  pill: "Obat",
  dumbbell: "Olahraga",
  clapperboard: "Film",
  gamepad: "Game",
  music: "Musik",
  book: "Buku",
  "graduation-cap": "Pendidikan",
  baby: "Anak",
  "paw-print": "Hewan peliharaan",
  gift: "Hadiah",
  "heart-handshake": "Donasi",
  briefcase: "Kerja",
  sparkles: "Bonus",
  store: "Toko",
  laptop: "Laptop",
  "badge-percent": "Diskon",
  "trending-up": "Investasi",
  "piggy-bank": "Tabungan",
  wrench: "Perbaikan",
  "circle-ellipsis": "Lainnya",
};

const LAINNYA = { ikon: CircleEllipsis, warna: "#9b9b9b" };

/**
 * Ikon dan warna satu kategori — satu sumber untuk daftar transaksi, bar
 * komposisi, budget, dan halaman detail, supaya "Makan" selalu oranye di mana
 * pun (seperti ikon berwadah berwarna di Pengaturan One UI).
 */
export function tandaKategori(k: Pick<Kategori, "icon" | "color"> | undefined): { ikon: LucideIcon; warna: string } {
  if (!k) return LAINNYA;
  return { ikon: IKON_KATEGORI[k.icon as keyof typeof IKON_KATEGORI] ?? CircleEllipsis, warna: k.color };
}

/** Ikon & warna untuk satu transaksi: draft dan pindah kantong punya tanda sendiri. */
export function tandaTransaksi(t: Pick<Transaction, "type" | "category" | "status">, daftar: Kategori[]) {
  if (t.status === "needs_review") return { ikon: CircleEllipsis, warna: "#ff5f5f" };
  if (t.type === "transfer") return { ikon: ArrowLeftRight, warna: "#3e91ff" };
  const k = cariKategori(daftar, t.category, t.type);
  // Pemasukan tanpa kategori jelas tetap bertanda panah masuk hijau.
  if (t.type === "income" && (!k || k.slug === "other")) return { ikon: ArrowDownLeft, warna: "#5ecb7a" };
  return tandaKategori(k);
}
