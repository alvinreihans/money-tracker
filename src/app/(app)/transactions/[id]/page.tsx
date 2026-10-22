import { notFound } from "next/navigation";
import { tujuanKembali } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DetailView from "./DetailView";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kembali?: string }>;
}) {
  const [{ id }, { kembali }] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();

  // RLS sudah membatasi ke baris milik user, jadi tidak ketemu = tidak ada
  // ATAU bukan miliknya — keduanya sama-sama 404 dari sisi user.
  const [{ data }, { data: ikutan }] = await Promise.all([
    supabase.from("transactions").select("*").eq("id", id).maybeSingle(),
    // Biaya admin / cashback yang menempel ke transaksi ini.
    supabase.from("transactions").select("id, amount").eq("induk_id", id).limit(1).maybeSingle(),
  ]);

  if (!data) notFound();

  return (
    <DetailView
      t={data as Transaction}
      kembali={tujuanKembali(kembali)}
      ikutan={ikutan ? { id: ikutan.id as string, amount: Number(ikutan.amount) } : null} />
  );
}
