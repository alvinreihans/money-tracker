import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DetailView from "./DetailView";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS sudah membatasi ke baris milik user, jadi tidak ketemu = tidak ada
  // ATAU bukan miliknya — keduanya sama-sama 404 dari sisi user.
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return <DetailView t={data as Transaction} />;
}
