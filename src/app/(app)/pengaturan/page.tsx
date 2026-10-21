import { createSupabaseServerClient } from "@/lib/supabase/server";
import PengaturanView from "./PengaturanView";

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <PengaturanView email={user?.email ?? null} />;
}
