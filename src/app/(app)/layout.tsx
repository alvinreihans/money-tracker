import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import BottomNav from "@/components/BottomNav";

export const dynamic = "force-dynamic";

/**
 * Kerangka tiga tab utama. Halaman login, reset password, dan detail transaksi
 * sengaja di luar grup ini — semuanya layar penuh tanpa navigasi bawah.
 *
 * Penjaga login ditaruh di sini supaya ketiga tab terlindungi sekaligus,
 * bukan diulang di tiap halaman.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Jumlah draft jadi badge di tab Riwayat.
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("status", "needs_review");

  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-background pb-20">
      {children}
      <BottomNav draftCount={count ?? 0} />
    </div>
  );
}
