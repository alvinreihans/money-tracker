import type { SupabaseClient } from "@supabase/supabase-js";
import { cocokkanKantong, type Kantong } from "@/lib/kantong";

/** Toleransi selisih tanggal saat mencocokkan dengan baris rekening koran lama. */
const DEDUPE_DAY_WINDOW = 2;

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Isian manual tanpa kantong padahal user sudah punya kantong. */
export class KantongKurang extends Error {}

/**
 * Simpan satu transaksi (dari struk, teks, atau isian manual) sambil
 * menyingkirkan baris rekening koran yang ternyata mewakili transaksi sama.
 *
 * Impor rekening koran sudah dihapus, tapi baris hasil impor lama masih ada.
 * Kalau transaksi yang sama dicatat lagi (mis. diisi manual dengan tanggal
 * mundur), tanpa ini ia tercatat dua kali. Catatan baru yang menang karena
 * memuat merchant dan kategori, sementara baris rekening koran cuma tertulis
 * "Pembayaran".
 */
export async function simpanTransaksi(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>,
): Promise<{ supersededStatement: boolean; transaction: unknown }> {
  const { payment_target, ...row } = input;
  const dariAi = "payment_target" in input;

  // Tautkan ke kantong. Form mengirim id-nya langsung (dicek memang milik
  // user); teks dan struk membawa nama ("gopay", "BRImo") yang dicocokkan.
  const { data } = await supabase.from("user_accounts").select("id, name, kind, aliases").eq("user_id", userId);
  const daftar = (data ?? []) as Pick<Kantong, "id" | "name" | "kind" | "aliases">[];
  const kantong =
    daftar.find((k) => k.id === row.kantong_id) ?? cocokkanKantong(row.payment_method as string | null, daftar);
  const tujuan =
    row.type === "transfer"
      ? (daftar.find((k) => k.id === row.kantong_tujuan_id) ?? cocokkanKantong(payment_target as string | null, daftar))
      : null;
  row.kantong_id = kantong?.id ?? null;
  row.kantong_tujuan_id = tujuan && tujuan.id !== kantong?.id ? tujuan.id : null;
  if (kantong) row.payment_method = kantong.name;

  // Begitu user punya kantong, tiap transaksi harus jelas kantongnya — kalau
  // tidak, saldonya diam-diam meleset (mis. kantong yang disebut sudah
  // dihapus). Hasil AI yang kantongnya tidak cocok jadi draft "Perlu
  // dibenerin"; isian manual ditolak karena user-nya ada di depan form.
  const kurangKantong = !row.kantong_id || (row.type === "transfer" && !row.kantong_tujuan_id);
  if (daftar.length > 0 && kurangKantong) {
    if (!dariAi) throw new KantongKurang(row.kantong_id ? "Pilih kantong tujuannya dulu." : "Pilih kantongnya dulu.");
    row.status = "needs_review";
  }
  // Belum punya kantong sama sekali: "transfer" dari AI tidak bisa dipastikan
  // pindah kantong sendiri, jadi dicatat pengeluaran seperti dulu.
  if (dariAi && daftar.length === 0 && row.type === "transfer") row.type = "expense";
  // Teks asli/OCR hanya disimpan untuk draft, sebagai bahan membetulkan.
  if (row.status === "confirmed") row.raw_ocr_text = null;

  const amount = Number(row.amount);
  const date = String(row.transaction_date);
  const tunai = kantong?.kind === "cash" || String(row.payment_method ?? "").toLowerCase() === "tunai";

  let supersededStatement = false;

  // Transaksi tunai tidak pernah muncul di rekening koran, jadi tidak ada yang
  // perlu disingkirkan — dan mencarinya hanya berisiko menghapus baris yang sah.
  if (amount > 0 && !tunai) {
    const { data: kandidat } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "statement")
      .eq("amount", amount)
      .gte("transaction_date", shiftDate(date, -DEDUPE_DAY_WINDOW))
      .lte("transaction_date", shiftDate(date, DEDUPE_DAY_WINDOW))
      .limit(1);

    const cocok = (kandidat ?? [])[0] as { id: string } | undefined;
    if (cocok) {
      const { error } = await supabase.from("transactions").delete().eq("id", cocok.id);
      if (!error) supersededStatement = true;
    }
  }

  const { data: tersimpan, error } = await supabase.from("transactions").insert(row).select().single();

  if (error) throw new Error(error.message);

  return { supersededStatement, transaction: tersimpan };
}
