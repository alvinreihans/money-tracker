import type { SupabaseClient } from "@supabase/supabase-js";
import { isoLokal } from "@/lib/format";
import { kantongDeposito, type Kantong } from "@/lib/kantong";
import type { IsiJejak } from "@/lib/jejak";
import { simpanJejak } from "@/lib/jejak-server";
import { tetapkanCicilan } from "@/lib/simpan-transaksi";
import { saldoSejak, type SaldoSejak } from "@/lib/waktu";
import type { Transaction } from "@/types/transaction";

/**
 * Simpan draft (SPEC-periksa-dulu §1): logika "selesai" bersama untuk Simpan
 * di kartu periksa, Simpan semua, dan form Ubah. Status → confirmed (ikut
 * dihitung), ikutan (biaya admin/cashback) ikut, nomor cicilan ditetapkan,
 * dan jejak draft + thumbnail-nya dipindah ke "Cara dicatat" (K1).
 */

export class GalatSimpan extends Error {}

/** Kolom yang diubah saat Simpan; dikembalikan apa adanya oleh Urungkan. */
export const KOLOM_SEBELUM = ["raw_ocr_text", "bukti_transfer", "cicilan_id", "cicilan_ke", "description"] as const;
export type SebelumSimpan = Partial<Pick<Transaction, (typeof KOLOM_SEBELUM)[number]>>;

/** Saldo sejak kapan per kantong (untuk pertanyaan jam di pertanyaanDraft). */
export async function muatSaldoDari(supabase: SupabaseClient): Promise<(id: string) => SaldoSejak | undefined> {
  const { data } = await supabase.from("user_accounts").select("id, name, kind, saldo_per, saldo_sejak, macam_simpanan");
  const semua = ((data ?? []) as Pick<Kantong, "id" | "name" | "kind" | "saldo_per" | "saldo_sejak" | "macam_simpanan">[]).filter((k) => !kantongDeposito(k));
  return (id) => {
    const k = semua.find((x) => x.id === id);
    return k ? saldoSejak(k) : undefined;
  };
}

export async function selesaikanDraft(
  supabase: SupabaseClient,
  tx: Transaction,
  cara: NonNullable<IsiJejak["cara"]>,
): Promise<{ transaction: Transaction; sebelum: SebelumSimpan }> {
  const sebelum = Object.fromEntries(KOLOM_SEBELUM.map((k) => [k, tx[k] ?? null])) as SebelumSimpan;
  // Petunjuk kantong & teks OCR (kolom bukti_transfer, raw_ocr_text) tidak dibawa transaksi yang sudah selesai;
  // teks & hasil bacanya kini ada di jejak "Cara dicatat".
  const patch: Partial<Transaction> = { status: "confirmed", raw_ocr_text: null, bukti_transfer: null };
  // Bayar cicilan: nomornya baru ditetapkan sekarang (SPEC-tagihan-cicilan).
  if (tx.cicilan_id) Object.assign(patch, await tetapkanCicilan(supabase, tx.cicilan_id, isoLokal(new Date())));

  // Jejak dulu: begitu statusnya confirmed, baris draft (jejak & thumbnail-nya) dihapus trigger.
  await simpanJejak(supabase, tx.id, { disimpan: new Date().toISOString(), cara });

  const { data: baru, error } = await supabase.from("transactions").update(patch).eq("id", tx.id).eq("status", "needs_review").select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!baru) throw new GalatSimpan("Catatan ini sudah disimpan atau sudah dihapus.");

  // Biaya admin / cashback mengikuti induknya: ikut dihitung, dari kantong yang sama.
  const t = baru as Transaction;
  await supabase
    .from("transactions")
    .update({ status: "confirmed", kantong_id: t.kantong_id, payment_method: t.payment_method })
    .eq("induk_id", tx.id)
    .or(`type.eq.expense,kantong_id.is.null${tx.kantong_id ? `,kantong_id.eq.${tx.kantong_id}` : ""}`);
  // Cashback yang sudah di kantong e-wallet perantaranya (SPEC-lengkapi K2) tetap di sana.
  await supabase.from("transactions").update({ status: "confirmed" }).eq("induk_id", tx.id);
  return { transaction: t, sebelum };
}

/** Urungkan Simpan: kembali jadi draft dengan isi sebelum disimpan; jejak & thumbnail kembali ke draft-nya. */
export async function urungkanSimpan(supabase: SupabaseClient, id: string, sebelum: SebelumSimpan): Promise<boolean> {
  const isi = Object.fromEntries(KOLOM_SEBELUM.filter((k) => k in sebelum).map((k) => [k, sebelum[k] ?? null]));
  const { data } = await supabase.from("transactions").update({ ...isi, status: "needs_review" }).eq("id", id).eq("status", "confirmed").select("id").maybeSingle();
  if (!data) return false;
  await supabase.from("transactions").update({ status: "needs_review" }).eq("induk_id", id);
  await supabase.rpc("urungkan_jejak", { p_id: id });
  return true;
}
