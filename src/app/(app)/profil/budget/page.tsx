import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import BudgetView from "./BudgetView";
import type { AvgMonthlyExpenseRow } from "@/types/transaction";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const supabase = await createSupabaseServerClient();
  const [
    user,
    { data: budgets },
    { data: rerata },
  ] = await Promise.all([
    ambilUser(),
    supabase.from("budgets").select("category, amount"),
    supabase.rpc("get_avg_monthly_expense_by_category"),
  ]);

  return (
    <BudgetView
      userId={user?.id ?? ""}
      awal={Object.fromEntries((budgets ?? []).map((b) => [b.category, Number(b.amount)]))}
      rerata={Object.fromEntries(((rerata ?? []) as AvgMonthlyExpenseRow[]).map((r) => [r.category, Number(r.avg_monthly)]))}
    />
  );
}
