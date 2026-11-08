import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Buang draft dengan Urungkan (SPEC-periksa-dulu §1): barisnya — beserta
 * cashback/biaya admin dan bagian pecahannya — dan thumbnail-nya disalin dulu,
 * lalu dimasukkan lagi dengan id yang sama bila diurungkan (pola
 * DeleteTransactionButton, SPEC-catat-tuntas).
 */
export interface SalinanDraft {
  id: string;
  baris: Record<string, unknown>[];
  foto: string | null;
}

/** Hapus draft; null bila gagal. */
export async function buangDraft(db: SupabaseClient, id: string): Promise<SalinanDraft | null> {
  const [{ data: baris }, foto] = await Promise.all([
    db.from("transactions").select("*").or(`id.eq.${id},induk_id.eq.${id},pecahan_dari.eq.${id}`),
    ambilFoto(id),
  ]);
  const { error } = await db.from("transactions").delete().eq("id", id);
  if (error) return null;
  const urut = ((baris ?? []) as Record<string, unknown>[]).sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  return { id, baris: urut, foto };
}

/** Kembalikan draft yang dibuang; galat (teks) atau null. */
export async function urungkanBuang(db: SupabaseClient, s: SalinanDraft): Promise<string | null> {
  for (const b of s.baris) {
    const { error } = await db.from("transactions").insert(b);
    if (error) return "Gagal mengurungkan.";
  }
  if (s.foto) await db.rpc("simpan_foto_draft", { p_id: s.id, p_foto: s.foto });
  return null;
}

async function ambilFoto(id: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/draft/${id}/foto`);
    if (!r.ok) return null;
    const isi = new Uint8Array(await r.arrayBuffer());
    let teks = "";
    for (let i = 0; i < isi.length; i += 0x8000) teks += String.fromCharCode(...isi.subarray(i, i + 0x8000));
    return btoa(teks);
  } catch {
    return null;
  }
}
