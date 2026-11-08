import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IsiJejak, LangkahJejak } from "@/lib/jejak";

/**
 * Menulis jejak "Cara dicatat" (SPEC-periksa-dulu §4) lewat RPC. Jejak hanya
 * pelengkap: kalau gagal, catatan/transaksinya tetap aman, jadi galatnya ditelan.
 */

/** Jejak draft: asal & hasil baca saat dibuat, lalu tanya-jawab (digabung di database). */
export async function catatJejakDraft(supabase: SupabaseClient, id: string, tambah: IsiJejak): Promise<void> {
  try {
    await supabase.rpc("catat_jejak_draft", { p_id: id, p_tambah: tambah });
  } catch {
    // Pelengkap saja.
  }
}

export async function tambahLangkah(supabase: SupabaseClient, id: string, langkah: LangkahJejak[]): Promise<void> {
  if (langkah.length) await catatJejakDraft(supabase, id, { langkah });
}

/** WebP ±720 px seperti thumbnail draft (SPEC-catat-chat). */
export async function thumbnail(gambar: Buffer): Promise<string | null> {
  try {
    return (await sharp(gambar).rotate().resize({ width: 720, withoutEnlargement: true }).webp({ quality: 60 }).toBuffer()).toString("base64");
  } catch {
    return null;
  }
}

/**
 * Jejak transaksi: isi digabung dengan jejak draft-nya; foto = `gambar` bila ada,
 * selain itu thumbnail draft yang dipindah (K1). `dari`: draft lain yang jejaknya
 * dipindah ke transaksi ini ("Lengkapi yang sudah ada").
 */
export async function simpanJejak(supabase: SupabaseClient, id: string, isi: IsiJejak, opsi: { gambar?: Buffer | null; dari?: string | null } = {}): Promise<boolean> {
  try {
    const foto = opsi.gambar ? await thumbnail(opsi.gambar) : null;
    const { data } = await supabase.rpc("tambah_jejak", { p_id: id, p_isi: isi, p_foto: foto, p_dari: opsi.dari ?? null });
    return data === true;
  } catch {
    return false;
  }
}
