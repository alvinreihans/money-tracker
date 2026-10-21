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
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("budgets").select("category", { count: "exact", head: true }),
  ]);

  return <PengaturanView email={user?.email ?? null} jumlahBudget={jumlahBudget ?? 0} />;
}
