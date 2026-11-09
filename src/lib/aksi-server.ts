import type { SupabaseClient } from "@supabase/supabase-js";
import { ambilKantong } from "@/lib/kantong";

/**
 * Terapkan & urungkan kartu usulan Tanya AI (SPEC-asisten-agen §3) lewat RPC
 * terapkan_usulan / urungkan_aksi. Semua pemeriksaan (pemilik, angka bank,
 * updated_at, batas 200) ada di RPC; di sini hanya pesan galat dan saldo
 * kantong yang tersentuh sesudahnya (supaya kartu & asisten tahu saldo baru).
 */

export class GalatAksi extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saldo sekarang kantong-kantong itu (id; yang bukan milik user tidak terbaca karena RLS). */
async function saldoKantong(supabase: SupabaseClient, ids: string[]): Promise<{ nama: string; saldo: number }[]> {
  if (!ids.length) return [];
  const { kantong, saldo } = await ambilKantong(supabase);
  return ids.flatMap((id) => {
    const k = kantong.find((x) => x.id === id);
    return k ? [{ nama: k.name, saldo: saldo.get(id) ?? 0 }] : [];
  });
}

const pesan = (e: { code?: string; message: string }, umum: string) => (e.code === "22023" ? e.message : umum);

export async function terapkanAksi(supabase: SupabaseClient, isian: unknown, kantongIds: unknown): Promise<{ aksi_id: string; n: number; saldo: { nama: string; saldo: number }[] }> {
  if (!isian || typeof isian !== "object") throw new GalatAksi("Usulannya tidak valid.");
  const { data, error } = await supabase.rpc("terapkan_usulan", { p: isian });
  if (error) throw new GalatAksi(pesan(error, "Gagal menerapkan. Coba lagi."));
  const d = data as { aksi_id: string; n: number; kantong_baru: string | null };
  const ids = (Array.isArray(kantongIds) ? kantongIds : []).map((x) => (x === "baru" ? d.kantong_baru : x)).filter((x): x is string => typeof x === "string" && UUID.test(x));
  return { aksi_id: d.aksi_id, n: d.n, saldo: await saldoKantong(supabase, [...new Set(ids)].slice(0, 20)) };
}

export async function urungkanAksi(supabase: SupabaseClient, aksiId: unknown, kantongIds: unknown): Promise<{ n: number; kantong_dihapus: boolean; kategori_dihapus?: boolean; saldo: { nama: string; saldo: number }[] }> {
  if (typeof aksiId !== "string" || !UUID.test(aksiId)) throw new GalatAksi("Usulan ini tidak ditemukan.");
  const { data, error } = await supabase.rpc("urungkan_aksi", { p_id: aksiId });
  if (error) throw new GalatAksi(pesan(error, "Gagal mengurungkan. Coba lagi."));
  const d = data as { n: number; kantong_dihapus: boolean; kategori_dihapus?: boolean };
  const ids = (Array.isArray(kantongIds) ? kantongIds : []).filter((x): x is string => typeof x === "string" && UUID.test(x));
  return { ...d, saldo: await saldoKantong(supabase, [...new Set(ids)].slice(0, 20)) };
}
