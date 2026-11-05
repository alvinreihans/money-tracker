import { ambilKantong } from "@/lib/kantong";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { kantongTujuan } from "@/lib/tujuan";
import TujuanView from "./TujuanView";

export const dynamic = "force-dynamic";

/** Tujuan tabungan (SPEC-tujuan-tabungan): kantong berjenis "tujuan" beserta saldonya. */
export default async function TujuanPage() {
  const supabase = await createSupabaseServerClient();
  const [user, { kantong, saldo }] = await Promise.all([ambilUser(), ambilKantong(supabase)]);
  const tujuan = kantong.filter(kantongTujuan);
  const ids = tujuan.map((k) => k.id).join(",");

  // Riwayat tiap tujuan: yang sudah dipakai (pindah ke "Selesai" begitu habis)
  // dan jumlah transaksinya (disebut di konfirmasi hapus, SPEC-perbaikan-temuan C5).
  const { data: tx } = ids
    ? await supabase.from("transactions").select("amount, type, kantong_id, kantong_tujuan_id").or(`kantong_id.in.(${ids}),kantong_tujuan_id.in.(${ids})`)
    : { data: [] };
  const dipakai = new Map<string, number>();
  const transaksi = new Map<string, number>();
  for (const t of tx ?? []) {
    for (const id of new Set([t.kantong_id, t.kantong_tujuan_id])) if (id) transaksi.set(id, (transaksi.get(id) ?? 0) + 1);
    if (t.type === "expense" && t.kantong_id) dipakai.set(t.kantong_id, (dipakai.get(t.kantong_id) ?? 0) + Number(t.amount));
  }

  return (
    <TujuanView
      userId={user?.id ?? ""}
      daftar={tujuan.map((k) => ({ ...k, saldo: saldo.get(k.id) ?? 0, dipakai: dipakai.get(k.id) ?? 0, transaksi: transaksi.get(k.id) ?? 0 }))}
    />
  );
}
