import UserAccountsCard from "@/components/UserAccountsCard";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RekeningPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="px-4 pb-4 pt-10">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">Rekening</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {user?.email}
          </p>
        </div>
        <SignOutButton />
      </div>

      <UserAccountsCard />

      <div className="mt-6">
        <ThemeToggle />
      </div>
    </main>
  );
}
