import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKantong } from "@/lib/kantong";
import { kantongUang } from "@/lib/pinjaman";
import { kantongTujuan } from "@/lib/tujuan";
import KantongView from "./KantongView";

export const dynamic = "force-dynamic";

export default async function KantongPage() {
  const supabase = await createSupabaseServerClient();
  const [user, { kantong, saldo }] = await Promise.all([ambilUser(), ambilKantong(supabase)]);

  // Tujuan tabungan dikelola di halamannya sendiri; di sini cukup jumlahnya, tetap ikut total aset.
  const tujuan = kantong.filter(kantongTujuan);
  return (
    <KantongView
      userId={user?.id ?? ""}
      daftar={kantong.filter((k) => kantongUang(k) && !kantongTujuan(k)).map((k) => ({ ...k, saldo: saldo.get(k.id) ?? 0 }))}
      disisihkan={{ jumlah: tujuan.length, total: tujuan.reduce((n, k) => n + (saldo.get(k.id) ?? 0), 0) }}
    />
  );
}
