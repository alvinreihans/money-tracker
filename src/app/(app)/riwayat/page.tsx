import { FILTER_RIWAYAT, PER_MUAT, queryRiwayat } from "@/lib/riwayat";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bersihkanCari } from "@/lib/transaksi-input";
import RiwayatView from "./RiwayatView";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

export default async function RiwayatPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter: diminta, q: qMentah } = await searchParams;
  const q = bersihkanCari(qMentah);
  const filter = diminta && FILTER_RIWAYAT.includes(diminta) ? diminta : "semua";
  const supabase = await createSupabaseServerClient();

  const { data, count } = await queryRiwayat(supabase, filter, q).range(0, PER_MUAT - 1);

  return <RiwayatView filter={filter} q={q} total={count ?? data?.length ?? 0} daftar={(data ?? []) as Transaction[]} />;
}
