import type { SupabaseClient } from "@supabase/supabase-js";
import type { KonteksAI } from "@/lib/extract";
import { KATEGORI_BAWAAN, type Kategori } from "@/lib/kategori";

/**
 * Kategori milik user yang sedang masuk (RLS). Kosong — belum dimigrasi atau
 * gagal ambil — berarti kategori bawaan, supaya mencatat tetap jalan.
 */
export async function ambilKategori(supabase: SupabaseClient): Promise<Kategori[]> {
  const { data } = await supabase.from("categories").select("id, type, slug, name, icon, color, sort, kelompok, penghasilan").order("sort");
  return data?.length ? (data as Kategori[]) : KATEGORI_BAWAAN;
}

/** Konteks untuk prompt AI: kategori, nama orang & kartu kredit, dan rencana cicilan milik user. */
export async function ambilKonteksAI(supabase: SupabaseClient): Promise<KonteksAI> {
  const [kategori, { data: pihak }, { data: cicilan }] = await Promise.all([
    ambilKategori(supabase),
    supabase.from("user_accounts").select("name").in("kind", ["orang", "kredit"]),
    supabase.from("cicilan").select("nama, penyedia"),
  ]);
  return {
    kategori,
    pihak: (pihak ?? []).map((p) => p.name as string),
    cicilan: (cicilan ?? []) as KonteksAI["cicilan"],
  };
}
