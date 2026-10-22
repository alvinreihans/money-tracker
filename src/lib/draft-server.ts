import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Thumbnail struk untuk percakapan yang belum selesai (SPEC-catat-chat.md):
 * supaya besok pagi user masih ingat itu transaksi apa. WebP ±720 px (masih
 * terbaca saat diperbesar), disimpan terenkripsi lewat RPC; ikut terhapus
 * begitu catatannya selesai. Gagal = tanpa foto, catatannya tetap aman.
 */
export async function simpanThumbnail(supabase: SupabaseClient, transaksiId: string, gambar: Buffer): Promise<void> {
  try {
    const webp = await sharp(gambar).rotate().resize({ width: 720, withoutEnlargement: true }).webp({ quality: 60 }).toBuffer();
    await supabase.rpc("simpan_foto_draft", { p_id: transaksiId, p_foto: webp.toString("base64") });
  } catch {
    // Foto hanya pengingat; catatannya sendiri sudah tersimpan.
  }
}
