import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKantong } from "@/lib/kantong";
import { kantongUang } from "@/lib/pinjaman";
import { ambilDeposito, infoDeposito, ringkasDisisihkan } from "@/lib/simpanan";
import { kantongTujuan } from "@/lib/tujuan";
import KantongView from "./KantongView";

export const dynamic = "force-dynamic";

export default async function KantongPage() {
  const supabase = await createSupabaseServerClient();
  const [user, { kantong, saldo }, { deposito, periode }] = await Promise.all([ambilUser(), ambilKantong(supabase), ambilDeposito(supabase)]);

  // Kantong uang beserta saldonya; deposito yang sudah selesai tidak tampil (SPEC-simpanan).
  const selesai = new Set(deposito.filter((d) => d.selesai).map((d) => d.kantong_id));
  const uang = kantong.filter(kantongUang).map((k) => ({ ...k, saldo: saldo.get(k.id) ?? 0 }));
  // Tujuan tabungan dikelola di halamannya sendiri; di sini cukup jumlahnya, tetap ikut total aset.
  // Yang disimpan di kantong lain sudah tampil di gabungan kantong itu.
  const tujuan = uang.filter(kantongTujuan);
  return (
    <KantongView
      userId={user?.id ?? ""}
      daftar={uang.filter((k) => !selesai.has(k.id))}
      deposito={infoDeposito(kantong, saldo, deposito, periode)}
      total={uang.reduce((n, k) => n + k.saldo, 0)}
      disisihkan={{ jumlah: tujuan.length, ...ringkasDisisihkan(tujuan.map((k) => ({ saldo: k.saldo, induk: uang.find((x) => x.id === k.induk_id)?.name ?? null }))) }}
    />
  );
}
