import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bersihkanCari } from "@/lib/transaksi-input";
import RiwayatView from "./RiwayatView";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

// Sama dengan pilihan di RiwayatView; konstanta dari berkas "use client" tidak
// bisa dibaca di server, jadi ditulis ulang di sini.
const FILTER_SAH = ["semua", "keluar", "masuk", "pindah", "draft"];

export default async function RiwayatPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter: diminta, q: qMentah } = await searchParams;
  const q = bersihkanCari(qMentah);
  const filter = diminta && FILTER_SAH.includes(diminta) ? diminta : "semua";
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (filter === "keluar") query = query.eq("type", "expense");
  else if (filter === "masuk") query = query.eq("type", "income");
  else if (filter === "pindah") query = query.eq("type", "transfer");
  else if (filter === "draft") query = query.eq("status", "needs_review");

  if (q) query = query.or(`merchant.ilike.%${q}%,description.ilike.%${q}%,payment_method.ilike.%${q}%`);

  const { data } = await query;

  return <RiwayatView filter={filter} q={q} daftar={(data ?? []) as Transaction[]} />;
}
