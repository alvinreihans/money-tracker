import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SpendingByCategoryChart from "@/components/SpendingByCategoryChart";
import RecentTransactions from "@/components/RecentTransactions";
import UploadReceiptForm from "@/components/UploadReceiptForm";
import UploadStatementForm from "@/components/UploadStatementForm";
import UserAccountsCard from "@/components/UserAccountsCard";
import SignOutButton from "@/components/SignOutButton";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guard: belum login -> arahkan ke halaman login.
  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Money Tracker
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Masuk dulu buat lihat ringkasan pengeluaran kamu.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Masuk / Daftar
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Money Tracker
          </h1>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <div className="space-y-6">
        <UploadReceiptForm />
        <UploadStatementForm />
        <RecentTransactions />
        <SpendingByCategoryChart />
        <UserAccountsCard />
      </div>
    </main>
  );
}
