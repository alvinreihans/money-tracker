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

/**
 * Konteks untuk prompt AI: kategori, nama orang & kartu kredit, rencana
 * cicilan, dan nama kantong uang & tujuan tabungan milik user (SPEC-ai-kantong).
 */
export async function ambilKonteksAI(supabase: SupabaseClient): Promise<KonteksAI> {
  const [kategori, { data: akun }, { data: cicilan }] = await Promise.all([
    ambilKategori(supabase),
    supabase.from("user_accounts").select("name, kind"),
    supabase.from("cicilan").select("nama, penyedia"),
  ]);
  const nama = (pihak: boolean) => (akun ?? []).filter((k) => (k.kind === "orang" || k.kind === "kredit") === pihak).map((k) => k.name as string);
  return {
    kategori,
    pihak: nama(true),
    cicilan: (cicilan ?? []) as KonteksAI["cicilan"],
    kantong: nama(false),
  };
}
