import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

/**
 * Kerangka halaman yang butuh login. Halaman masuk dan password baru sengaja
 * di luar grup ini — keduanya berdiri sendiri tanpa navigasi.
 *
 * Penjaga login ditaruh di sini supaya semua halaman di dalamnya terlindungi
 * sekaligus, bukan diulang di tiap halaman.
 */
export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Jumlah draft jadi badge di menu Riwayat.
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("status", "needs_review");

  return (
    <AppShell email={user.email ?? null} draftCount={count ?? 0}>
      {children}
    </AppShell>
  );
}
