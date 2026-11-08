import type { SupabaseClient } from "@supabase/supabase-js";
import { cariCalonPindah, isianJadikanPindah, kalimatCalonPindah, type CalonPindah, type KantongPindah, type TransaksiPindah } from "@/lib/pindah";
import { namaDariMetadata } from "@/lib/nama-rekening";

/**
 * Jalur server penautan ulang (SPEC-kantong-sendiri A-3): calon pindah kantong
 * untuk satu kantong, dan menerapkannya lewat RPC jadikan_pindah. RLS
 * membatasi semuanya ke data user yang sedang masuk. Dipakai
 * /api/kantong/[id]/calon-pindah, /api/kantong/pindah, dan (nanti) asisten agen.
 */

const KOLOM = "id, amount, type, status, source, merchant, description, kantong_id, kantong_tujuan_id, transaction_date, waktu, updated_at, ref_bank_tujuan, induk_id, cicilan_id, pecahan_dari";
// ponytail: 3000 transaksi rekening koran terbaru; yang lebih lama tidak ditawarkan ditautkan ulang.
const BATAS = 3000;

export interface HasilCalon {
  kantong: KantongPindah;
  calon: CalonPindah[];
  /** "3 transaksi lama sepertinya pindah ke DANA. Jadikan pindah kantong?"; null bila tidak ada calon. */
  kalimat: string | null;
}

/** Calon pindah kantong untuk kantong uang `kantongId`; null bila kantongnya tidak ada / bukan kantong uang. */
export async function muatCalonPindah(supabase: SupabaseClient, kantongId: string): Promise<HasilCalon | null> {
  const [{ data: k }, { data: pengguna }] = await Promise.all([
    supabase.from("user_accounts").select("id, name, kind, aliases, nomor_akhir").eq("id", kantongId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const kantong = k as KantongPindah | null;
  if (!kantong || !["bank", "ewallet", "cash"].includes(kantong.kind)) return null;
  const dasar = () =>
    supabase.from("transactions").select(KOLOM).eq("status", "confirmed").in("type", ["expense", "income"]).is("kantong_tujuan_id", null).is("induk_id", null).is("cicilan_id", null);
  const [rek, lawan] = await Promise.all([
    dasar().eq("source", "statement").neq("kantong_id", kantongId).order("transaction_date", { ascending: false }).limit(BATAS),
    dasar().eq("kantong_id", kantongId).order("transaction_date", { ascending: false }).limit(BATAS),
  ]);
  if (rek.error) throw new Error(`calon pindah: ${rek.error.message}`);
  if (lawan.error) throw new Error(`calon pindah: ${lawan.error.message}`);
  const transaksi = [...((rek.data ?? []) as TransaksiPindah[]), ...((lawan.data ?? []) as TransaksiPindah[])];
  const calon = cariCalonPindah(kantong, transaksi, { namaUser: namaDariMetadata(pengguna?.user?.user_metadata) });
  return { kantong, calon, kalimat: calon.length ? kalimatCalonPindah(kantong.name, calon) : null };
}

export class GalatPindah extends Error {}

/**
 * Jadikan pindah kantong: calon dihitung ulang di server (isian klien hanya memilih id),
 * lalu RPC jadikan_pindah (atomik; gagal bila ada yang berubah sejak ditampilkan).
 * Mengembalikan salinan untuk Urungkan.
 */
export async function terapkanPindah(supabase: SupabaseClient, kantongId: string, ids: string[] | null): Promise<{ n: number; salinan: unknown[] }> {
  const hasil = await muatCalonPindah(supabase, kantongId);
  if (!hasil) throw new GalatPindah("Kantongnya tidak ditemukan.");
  const dipilih = ids ? hasil.calon.filter((c) => ids.includes(c.id)) : hasil.calon;
  if (!dipilih.length || (ids && dipilih.length !== new Set(ids).size)) throw new GalatPindah("Transaksinya sudah berubah sejak ditampilkan. Muat ulang dulu.");
  const { data, error } = await supabase.rpc("jadikan_pindah", { p: isianJadikanPindah(hasil.kantong, dipilih) });
  if (error) throw new GalatPindah(error.code === "22023" || error.code === "23505" ? error.message : "Gagal menjadikan pindah kantong. Coba lagi.");
  const d = data as { n: number; salinan: unknown[] };
  return { n: d.n, salinan: d.salinan };
}

/** Urungkan jadikan pindah dengan salinan dari terapkanPindah. */
export async function urungkanPindah(supabase: SupabaseClient, salinan: unknown[]): Promise<number> {
  const { data, error } = await supabase.rpc("urungkan_jadikan_pindah", { p: { salinan } });
  if (error) throw new GalatPindah(error.code === "22023" ? error.message : "Gagal mengurungkan. Coba lagi.");
  return (data as { n: number }).n;
}
