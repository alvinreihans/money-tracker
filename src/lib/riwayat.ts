import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Query daftar Riwayat — satu sumber untuk server (100 pertama) dan browser
 * ("Muat lagi" menambah 100 berikutnya tanpa pindah halaman).
 */

export const FILTER_RIWAYAT = ["semua", "keluar", "masuk", "pindah"];

/** Jumlah baris per muat. */
export const PER_MUAT = 100;

/**
 * Transaksi untuk filter & teks cari ini, terbaru dulu, beserta jumlah
 * sebenarnya (`count`). `q` harus sudah lewat bersihkanCari. Tambahkan
 * `.range()` untuk memilih halaman.
 */
export function queryRiwayat(supabase: SupabaseClient, filter: string, q: string) {
  let query = supabase
    .from("transactions")
    .select("*", { count: "exact" })
    // Yang belum selesai tidak di Riwayat; ada di lembar Catat (SPEC-catat-chat).
    .eq("status", "confirmed")
    .order("transaction_date", { ascending: false })
    .order("waktu", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    // Pemecah seri: tanpa ini, baris bertanggal & waktu catat sama bisa
    // terlewat atau dobel di antara dua halaman.
    .order("id", { ascending: false });

  if (filter === "keluar") query = query.eq("type", "expense");
  else if (filter === "masuk") query = query.eq("type", "income");
  else if (filter === "pindah") query = query.eq("type", "transfer");

  if (q) query = query.or(`merchant.ilike.%${q}%,description.ilike.%${q}%,payment_method.ilike.%${q}%`);

  return query;
}
