import type { SupabaseClient } from "@supabase/supabase-js";
import { geserHari, isoLokal } from "@/lib/format";
import { LAINNYA } from "@/lib/kategori";

/**
 * Ingat kategori per merchant (SPEC-ingat-kategori): transaksi dari merchant
 * yang pernah dicatat menentukan kategori unggahan berikutnya, dan
 * membetulkan kategorinya bisa ikut membetulkan transaksi lama yang serupa.
 * Merchant tersimpan terenkripsi, jadi dicocokkan di sini setelah didekripsi
 * view — tidak ada daftar merchant polos yang disimpan.
 */

/** Nama merchant tanpa beda huruf besar-kecil, spasi, dan tanda baca. */
export const kunciMerchant = (nama: string | null | undefined) => (nama ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Nama terpotong ("WAITENJOY.CO…") tetap cocok, asal sisanya cukup panjang. */
const AWALAN_MIN = 6;
/** AI sering membuang kata seperti "Toko"/"Warung": "qwrtz" = "Toko Qwrtz", asal tidak terlalu pendek. */
const KATA_MIN = 5;

const kataMerchant = (nama: string | null | undefined) => (nama ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export function merchantSama(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = kunciMerchant(a);
  const y = kunciMerchant(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [pendek, panjang] = x.length <= y.length ? [x, y] : [y, x];
  if (pendek.length >= AWALAN_MIN && panjang.startsWith(pendek)) return true;
  // Semua kata nama yang lebih pendek ada di nama yang lain.
  const [kp, kl] = x.length <= y.length ? [kataMerchant(a), new Set(kataMerchant(b))] : [kataMerchant(b), new Set(kataMerchant(a))];
  return pendek.length >= KATA_MIN && kp.every((k) => kl.has(k));
}

export interface BarisIngat {
  merchant: string | null;
  category: string;
  kelompok?: string | null;
  type: string;
}

/**
 * Kategori dari transaksi terakhir merchant yang sama dengan jenis sama
 * (`baris` terurut dari yang terbaru). "Lainnya" tidak diingat: tidak memberi
 * informasi, jadi tebakan AI yang spesifik lebih baik.
 */
export function ingatKategori(baris: BarisIngat[], merchant: string, type: string): { category: string; kelompok: string | null } | null {
  const t = baris.find((b) => b.type === type && b.category !== LAINNYA && merchantSama(b.merchant, merchant));
  return t ? { category: t.category, kelompok: t.kelompok ?? null } : null;
}

// ponytail: 300 transaksi terakhir dalam setahun; naikkan atau pindahkan ke indeks bila merchant lama terlupa.
const BATAS_INGAT = 300;

/** Dipakai simpanTransaksi untuk hasil AI. */
export async function ambilIngatan(supabase: SupabaseClient, merchant: string, type: string) {
  const { data } = await supabase
    .from("transactions")
    .select("merchant, category, kelompok, type")
    .eq("type", type)
    .eq("status", "confirmed")
    .is("pecahan_dari", null)
    .is("induk_id", null)
    .gte("transaction_date", geserHari(isoLokal(new Date()), -365))
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(BATAS_INGAT);
  return ingatKategori((data ?? []) as BarisIngat[], merchant, type);
}

export interface BarisSerupa extends BarisIngat {
  id: string;
  amount: number | string;
  transaction_date: string;
}

// ponytail: 2000 transaksi terbaru per jenis; cukup untuk membetulkan riwayat satu merchant.
const BATAS_SERUPA = 2000;

/**
 * Transaksi lain dari merchant yang sama (jenis sama), untuk ditawarkan ikut
 * dibetulkan. Bagian pecahan, ikutan, dan cicilan tidak ikut: kategorinya
 * sengaja berbeda atau ditentukan rencananya.
 */
export async function cariSerupa(
  supabase: SupabaseClient,
  merchant: string,
  type: string,
  opsi: { kecuali?: string | null; bukan?: string | null } = {},
): Promise<BarisSerupa[]> {
  const { data } = await supabase
    .from("transactions")
    .select("id, merchant, category, kelompok, type, amount, transaction_date")
    .eq("type", type)
    .eq("status", "confirmed")
    .is("pecahan_dari", null)
    .is("induk_id", null)
    .is("cicilan_id", null)
    .order("transaction_date", { ascending: false })
    .limit(BATAS_SERUPA);
  return ((data ?? []) as BarisSerupa[]).filter((b) => b.id !== opsi.kecuali && b.category !== opsi.bukan && merchantSama(b.merchant, merchant));
}
