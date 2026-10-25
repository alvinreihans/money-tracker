import { notFound } from "next/navigation";
import { tujuanKembali } from "@/lib/format";
import { ambilDetail } from "@/lib/riwayat";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DetailView from "./DetailView";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kembali?: string }>;
}) {
  const [{ id }, { kembali }] = await Promise.all([params, searchParams]);
  // Tidak ketemu = tidak ada ATAU bukan miliknya — sama-sama 404 dari sisi user.
  const detail = await ambilDetail(await createSupabaseServerClient(), id);
  if (!detail) notFound();

  return <DetailView t={detail.t} ikutan={detail.ikutan} kembali={tujuanKembali(kembali)} />;
}
