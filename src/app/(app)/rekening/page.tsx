import UserAccountsCard from "@/components/UserAccountsCard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RekeningPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <UserAccountsCard email={user?.email ?? null} />;
}
