import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtIDR } from "@/lib/format";
import { kirimPush, type Langganan } from "@/lib/push";
import type { Transaction } from "@/types/transaction";

/**
 * Push "struk barusan belum lengkap" ke perangkat milik user (RLS), untuk
 * gambar yang diproses di latar. Diketuk → langsung ke percakapannya. Tanpa
 * langganan, catatannya tetap menunggu di "Belum selesai".
 */
export async function kabariDraft(supabase: SupabaseClient, tx: Transaction, asal: string): Promise<void> {
  try {
    const { data } = await supabase.from("push_langganan").select("endpoint, p256dh, auth");
    if (!data?.length) return;
    const apa = [tx.merchant ?? "Struk", Number(tx.amount) > 0 ? fmtIDR(Number(tx.amount)) : null].filter(Boolean).join(" · ");
    const r = await kirimPush(
      data as Langganan[],
      [{ judul: "Struk barusan belum lengkap", isi: `${apa} — ketuk untuk melengkapi.`, url: `/?catat=${tx.id}`, tag: `draft-${tx.id}` }],
      asal,
    );
    if (r.mati.length) await supabase.from("push_langganan").delete().in("endpoint", r.mati);
  } catch {
    // Push hanya pengingat; catatannya sudah tersimpan.
  }
}

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
