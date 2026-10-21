import type { TransactionType } from "@/types/transaction";

/**
 * Kategori milik user (tabel `categories`). transactions.category dan
 * budgets.category menyimpan `slug`-nya. Fungsi murni — diuji di
 * scripts/uji-kategori.mts.
 */

export type JenisKategori = "expense" | "income";

export interface Kategori {
  id?: string;
  type: JenisKategori;
  slug: string;
  name: string;
  /** Kunci ikon, lihat IKON_KATEGORI di components/kategori.ts. */
  icon: string;
  color: string;
  sort: number;
}

/** Tempat jatuh: tidak bisa dihapus; transaksi dari kategori terhapus pindah ke sini. */
export const LAINNYA = "other";

/** Sama dengan seed_kategori_bawaan() di migrasi 20261023120000_kategori.sql. */
export const KATEGORI_BAWAAN: Kategori[] = [
  { type: "expense", slug: "food", name: "Makan", icon: "utensils", color: "#ff9f43", sort: 1 },
  { type: "expense", slug: "groceries", name: "Belanja harian", icon: "shopping-basket", color: "#5ecb7a", sort: 2 },
  { type: "expense", slug: "transport", name: "Transportasi", icon: "car", color: "#3e91ff", sort: 3 },
  { type: "expense", slug: "shopping", name: "Belanja", icon: "shopping-bag", color: "#ff7a9c", sort: 4 },
  { type: "expense", slug: "health", name: "Kesehatan", icon: "heart-pulse", color: "#ff5f5f", sort: 5 },
  { type: "expense", slug: "entertainment", name: "Hiburan", icon: "clapperboard", color: "#bf7af0", sort: 6 },
  { type: "expense", slug: "bills", name: "Tagihan", icon: "receipt", color: "#4fc9e0", sort: 7 },
  { type: "expense", slug: "fees", name: "Biaya admin", icon: "coins", color: "#8fa3bf", sort: 8 },
  { type: "expense", slug: LAINNYA, name: "Lainnya", icon: "circle-ellipsis", color: "#9b9b9b", sort: 99 },
  { type: "income", slug: "salary", name: "Gaji", icon: "briefcase", color: "#5ecb7a", sort: 1 },
  { type: "income", slug: "bonus", name: "Bonus/THR", icon: "sparkles", color: "#5ecb7a", sort: 2 },
  { type: "income", slug: "business", name: "Usaha/Jualan", icon: "store", color: "#5ecb7a", sort: 3 },
  { type: "income", slug: "freelance", name: "Freelance/Proyek", icon: "laptop", color: "#5ecb7a", sort: 4 },
  { type: "income", slug: "gift", name: "Pemberian", icon: "gift", color: "#5ecb7a", sort: 5 },
  { type: "income", slug: "refund", name: "Cashback/Refund", icon: "badge-percent", color: "#5ecb7a", sort: 6 },
  { type: "income", slug: "investment", name: "Bunga/Investasi", icon: "trending-up", color: "#5ecb7a", sort: 7 },
  { type: "income", slug: LAINNYA, name: "Lainnya", icon: "circle-ellipsis", color: "#9b9b9b", sort: 99 },
];

/** Pilihan warna kategori buatan user (abu khusus Lainnya). */
export const WARNA_KATEGORI = ["#ff9f43", "#5ecb7a", "#3e91ff", "#ff7a9c", "#ff5f5f", "#bf7af0", "#4fc9e0", "#8fa3bf"];

/** Kunci ikon yang boleh dipilih; peta ke komponen ikonnya di components/kategori.ts. */
export const KUNCI_IKON = [
  "utensils", "coffee", "shopping-basket", "shopping-bag", "shirt", "car", "bus", "fuel", "plane",
  "home", "zap", "wifi", "smartphone", "receipt", "coins", "heart-pulse", "pill", "dumbbell",
  "clapperboard", "gamepad", "music", "book", "graduation-cap", "baby", "paw-print", "gift",
  "heart-handshake", "briefcase", "sparkles", "store", "laptop", "badge-percent", "trending-up",
  "piggy-bank", "wrench", "circle-ellipsis",
] as const;

/** Kategori untuk satu jenis transaksi, urut. Pindah kantong tidak berkategori. */
export function kategoriJenis(daftar: Kategori[], type: TransactionType): Kategori[] {
  if (type === "transfer") return [];
  return daftar
    .filter((k) => k.type === type)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "id"));
}

/** Kategori untuk slug ini, diutamakan yang jenisnya sama ("other" ada di dua jenis). */
export function cariKategori(daftar: Kategori[], slug: string, type?: TransactionType): Kategori | undefined {
  return daftar.find((k) => k.slug === slug && (!type || k.type === type)) ?? daftar.find((k) => k.slug === slug);
}

/** Nama yang ditampilkan; slug yang tidak dikenal (kategori lama terhapus) jadi "Lainnya". */
export function namaKategori(daftar: Kategori[], slug: string, type?: TransactionType): string {
  return cariKategori(daftar, slug, type)?.name ?? "Lainnya";
}

/** Slug kategori buatan user: acak, supaya tetap sama walau namanya diganti. */
export function slugBaru(acak: () => string = () => crypto.randomUUID()): string {
  return `c-${acak().replace(/-/g, "").slice(0, 10)}`;
}

export type HasilKategori =
  | { ok: true; data: { name: string; icon: string; color: string } }
  | { ok: false; error: string };

/** Isian tambah/ubah kategori. `lain`: kategori lain dengan jenis sama, untuk cek nama kembar. */
export function validasiKategori(input: Record<string, unknown>, lain: Kategori[] = []): HasilKategori {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, error: "Namanya diisi dulu." };
  if (name.length > 30) return { ok: false, error: "Namanya kepanjangan, maksimal 30 huruf." };
  if (lain.some((k) => k.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: `Kategori "${name}" udah ada.` };
  }
  const icon = input.icon;
  if (typeof icon !== "string" || !(KUNCI_IKON as readonly string[]).includes(icon)) {
    return { ok: false, error: "Pilih ikonnya dulu." };
  }
  const color = input.color;
  if (typeof color !== "string" || !(WARNA_KATEGORI.includes(color) || color === "#9b9b9b")) {
    return { ok: false, error: "Pilih warnanya dulu." };
  }
  return { ok: true, data: { name, icon, color } };
}
