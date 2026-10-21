import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import { saranCatat } from "@/lib/saran";
import { ambilKategori } from "@/lib/kategori-server";

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

  const [{ count }, { data: terakhir }, { data: kantong }, kategori] = await Promise.all([
    // Jumlah draft jadi penanda di menu Riwayat.
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review"),
    // Bahan saran di kolom "Catat". Dua puluh baris cukup untuk dapat lima
    // yang berbeda; pemasukan dan pindah kantong jarang diulang persis.
    supabase
      .from("transactions")
      .select("merchant, amount, payment_method")
      .eq("type", "expense")
      .eq("status", "confirmed")
      .not("merchant", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
    // Pilihan kantong di form catat & edit.
    supabase.from("user_accounts").select("id, name, kind").order("created_at"),
    ambilKategori(supabase),
  ]);

  return (
    <AppShell draftCount={count ?? 0} saran={saranCatat(terakhir ?? [])} kantong={kantong ?? []}
      kategori={kategori}
    >
      {children}
    </AppShell>
  );
}
