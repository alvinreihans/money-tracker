import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { PanelDetail } from "@/components/oneui";
import s from "@/components/ui.module.css";
import ProfilView from "./ProfilView";

export const dynamic = "force-dynamic";

/**
 * Profil = menu + halaman pengaturannya (SPEC-layar-lebar). Di layar lebar
 * keduanya berdampingan, ala Pengaturan Samsung di tablet; di layar sempit
 * hanya satu: menu di /profil, halamannya di /profil/*. /profil sendiri tidak
 * berisi halaman (page.tsx kosong), jadi panel kanannya `:empty`.
 */
export default async function ProfilLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const [user, { count: jumlahBudget }, { count: jumlahKantong }, { data: metode }] = await Promise.all([
    ambilUser(),
    supabase.from("budgets").select("category", { count: "exact", head: true }),
    supabase.from("user_accounts").select("id", { count: "exact", head: true }).in("kind", ["bank", "ewallet", "cash"]),
    supabase.from("metode_budget").select("metode").maybeSingle(),
  ]);

  return (
    <div className={`${s.duaPanel} ${s.duaPanelLipat} ${s.lebar}`} data-tanpa-kembali>
      <div className={s.panelDaftar}>
        <ProfilView
          email={user?.email ?? null}
          jumlahKantong={jumlahKantong ?? 0}
          jumlahBudget={jumlahBudget ?? 0}
          metode={(metode?.metode as string | null) ?? null}
        />
      </div>
      <PanelDetail kosong="Pilih pengaturan di sebelah kiri.">{children}</PanelDetail>
    </div>
  );
}
