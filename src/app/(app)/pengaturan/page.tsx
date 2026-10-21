import { createSupabaseServerClient } from "@/lib/supabase/server";
import PengaturanView from "./PengaturanView";

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const supabase = await createSupabaseServerClient();
  const [
    {
      data: { user },
    },
    { count: jumlahBudget },
    { count: jumlahKantong },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("budgets").select("category", { count: "exact", head: true }),
    supabase.from("user_accounts").select("id", { count: "exact", head: true }),
  ]);

  return <PengaturanView email={user?.email ?? null} jumlahKantong={jumlahKantong ?? 0} jumlahBudget={jumlahBudget ?? 0} />;
}
