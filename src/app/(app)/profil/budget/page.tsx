import { isoLokal } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";
import { ambilPengaturanMetode, pemasukanBasis } from "@/lib/metode";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import BudgetView from "./BudgetView";
import type { AvgMonthlyExpenseRow } from "@/types/transaction";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const supabase = await createSupabaseServerClient();
  const bulan = isoLokal(new Date()).slice(0, 7);
  const lalu = geserBulan(bulan, -1);
  const [
    user,
    { data: budgets },
    { data: rerata },
    pengaturan,
    { data: pemasukan },
  ] = await Promise.all([
    ambilUser(),
    supabase.from("budgets").select("category, amount"),
    supabase.rpc("get_avg_monthly_expense_by_category"),
    ambilPengaturanMetode(supabase),
    // Pemasukan bulan ini & lalu: contoh rupiah tiap metode (SPEC-metode-budget).
    supabase.from("transactions").select("amount, type, category, transaction_date").eq("type", "income").eq("status", "confirmed").gte("transaction_date", `${lalu}-01`),
  ]);
  const baris = pemasukan ?? [];
  const basis = pemasukanBasis(baris.filter((t) => t.transaction_date.startsWith(bulan))) || pemasukanBasis(baris.filter((t) => t.transaction_date.startsWith(lalu)));

  return (
    <BudgetView
      userId={user?.id ?? ""}
      awal={Object.fromEntries((budgets ?? []).map((b) => [b.category, Number(b.amount)]))}
      rerata={Object.fromEntries(((rerata ?? []) as AvgMonthlyExpenseRow[]).map((r) => [r.category, Number(r.avg_monthly)]))}
      pengaturan={pengaturan}
      basis={basis}
    />
  );
}
