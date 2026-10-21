import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKantong } from "@/lib/kantong";
import KantongView from "./KantongView";

export const dynamic = "force-dynamic";

export default async function KantongPage() {
  const supabase = await createSupabaseServerClient();
  const [
    {
      data: { user },
    },
    { kantong, saldo },
  ] = await Promise.all([supabase.auth.getUser(), ambilKantong(supabase)]);

  return <KantongView userId={user?.id ?? ""} daftar={kantong.map((k) => ({ ...k, saldo: saldo.get(k.id) ?? 0 }))} />;
}
