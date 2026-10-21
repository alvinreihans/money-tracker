import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rentangBulan } from "@/lib/periode";
import BerandaView from "./BerandaView";
import type { AvgMonthlyExpenseRow, Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

const JUMLAH_DI_BERANDA = 6;

export default async function BerandaPage() {
  const supabase = await createSupabaseServerClient();
  const { awalBulanIni, awalBulanLalu } = rentangBulan();

  const jumlahkan = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  // Transfer dikecualikan di semua hitungan: itu uang pindah kantong sendiri,
  // bukan pengeluaran maupun pemasukan.
  const [
    {
      data: { user },
    },
    { data: terbaru },
    { data: keluarIni },
    { data: masukIni },
    { data: keluarLalu },
    { count: draft },
    { data: rerata, error: rerataError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(JUMLAH_DI_BERANDA),
    supabase
      .from("transactions")
      .select("amount")
      .eq("type", "expense")
      .eq("status", "confirmed")
      .gte("transaction_date", awalBulanIni),
    supabase
      .from("transactions")
      .select("amount")
      .eq("type", "income")
      .eq("status", "confirmed")
      .gte("transaction_date", awalBulanIni),
    supabase
      .from("transactions")
      .select("amount")
      .eq("type", "expense")
      .eq("status", "confirmed")
      .gte("transaction_date", awalBulanLalu)
      .lt("transaction_date", awalBulanIni),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review"),
    supabase.rpc("get_avg_monthly_expense_by_category"),
  ]);

  return (
    <BerandaView
      email={user?.email ?? null}
      ringkasan={{
        keluar: jumlahkan(keluarIni),
        masuk: jumlahkan(masukIni),
        keluarBulanLalu: jumlahkan(keluarLalu),
      }}
      draft={draft ?? 0}
      terbaru={(terbaru ?? []) as Transaction[]}
      rerata={(rerata ?? []) as AvgMonthlyExpenseRow[]}
      rerataError={rerataError?.message ?? null}
    />
  );
}
