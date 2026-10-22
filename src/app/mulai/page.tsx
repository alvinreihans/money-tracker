import { redirect } from "next/navigation";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import type { Kantong } from "@/lib/kantong";
import MulaiView from "./MulaiView";

export const dynamic = "force-dynamic";

/**
 * Kenalan untuk pengguna baru: cara mencatat, lalu kantong & saldo awalnya.
 * Di luar grup (app) supaya tanpa navigasi bawah — dan supaya penjaga di
 * layout (app), yang mengarahkan ke sini, tidak berputar.
 */
export default async function MulaiPage() {
  const user = await ambilUser();
  if (!user) redirect("/login?lanjut=%2Fmulai");
  if (user.onboarding) redirect("/");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("user_accounts").select("*").order("created_at");

  return <MulaiView userId={user.id} kantong={(data ?? []) as Kantong[]} />;
}
