import type { SupabaseClient } from "@supabase/supabase-js";

/** Toleransi selisih tanggal saat mencocokkan dengan baris rekening koran lama. */
const DEDUPE_DAY_WINDOW = 2;

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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
  row: Record<string, unknown>,
): Promise<{ supersededStatement: boolean; transaction: unknown }> {
  const amount = Number(row.amount);
  const date = String(row.transaction_date);
  const tunai = String(row.payment_method ?? "").toLowerCase() === "tunai";

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

  const { data, error } = await supabase.from("transactions").insert(row).select().single();

  if (error) throw new Error(error.message);

  return { supersededStatement, transaction: data };
}
