import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import ProfilView from "./ProfilView";

export const dynamic = "force-dynamic";

export default async function ProfilPage() {
  const supabase = await createSupabaseServerClient();
  const [
    user,
    { count: jumlahBudget },
    { count: jumlahKantong },
  ] = await Promise.all([
    ambilUser(),
    supabase.from("budgets").select("category", { count: "exact", head: true }),
    supabase.from("user_accounts").select("id", { count: "exact", head: true }).in("kind", ["bank", "ewallet", "cash"]),
  ]);

  return <ProfilView email={user?.email ?? null} jumlahKantong={jumlahKantong ?? 0} jumlahBudget={jumlahBudget ?? 0} />;
}
