import type { SupabaseClient } from "@supabase/supabase-js";
import { KATEGORI_BAWAAN, type Kategori } from "@/lib/kategori";

/**
 * Kategori milik user yang sedang masuk (RLS). Kosong — belum dimigrasi atau
 * gagal ambil — berarti kategori bawaan, supaya mencatat tetap jalan.
 */
export async function ambilKategori(supabase: SupabaseClient): Promise<Kategori[]> {
  const { data } = await supabase.from("categories").select("id, type, slug, name, icon, color, sort").order("sort");
  return data?.length ? (data as Kategori[]) : KATEGORI_BAWAAN;
}
