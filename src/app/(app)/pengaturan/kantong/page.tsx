import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKantong } from "@/lib/kantong";
import { kantongUang } from "@/lib/pinjaman";
import KantongView from "./KantongView";

export const dynamic = "force-dynamic";

export default async function KantongPage() {
  const supabase = await createSupabaseServerClient();
  const [user, { kantong, saldo }] = await Promise.all([ambilUser(), ambilKantong(supabase)]);

  return <KantongView userId={user?.id ?? ""} daftar={kantong.filter(kantongUang).map((k) => ({ ...k, saldo: saldo.get(k.id) ?? 0 }))} />;
}
