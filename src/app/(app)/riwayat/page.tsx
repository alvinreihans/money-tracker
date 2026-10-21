import { createSupabaseServerClient } from "@/lib/supabase/server";
import RiwayatView from "./RiwayatView";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

const FILTER_SAH = ["semua", "keluar", "masuk", "pindah", "draft"];

export default async function RiwayatPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: diminta } = await searchParams;
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

  const { data } = await query;

  return <RiwayatView filter={filter} daftar={(data ?? []) as Transaction[]} />;
}
