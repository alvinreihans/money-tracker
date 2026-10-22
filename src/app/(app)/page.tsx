import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hitungStreak, progresBudget, trenBulanan } from "@/lib/analitik";
import { geserHari, isoLokal } from "@/lib/format";
import { ambilKantong } from "@/lib/kantong";
import { rentangBulan } from "@/lib/periode";
import BerandaView from "./BerandaView";
import type { AvgMonthlyExpenseRow, Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

const BULAN_TREN = 6;
// ponytail: streak dihitung dari catatan 90 hari terakhir; lebih dari itu
// tetap tampil "90 hari". Pindahkan ke RPC kalau ada yang betah selama itu.
const HARI_STREAK = 90;

export default async function BerandaPage() {
  const supabase = await createSupabaseServerClient();
  const sekarang = new Date();
  const { awalBulanIni, awalBulanLalu } = rentangBulan(sekarang);
  const hariIni = isoLokal(sekarang);
  const [tahun, bulan] = hariIni.split("-").map(Number);
  const idxAwalTren = tahun * 12 + (bulan - 1) - (BULAN_TREN - 1);
  const awalTren = `${Math.floor(idxAwalTren / 12)}-${String((idxAwalTren % 12) + 1).padStart(2, "0")}-01`;

  const jumlahkan = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  // Transfer dikecualikan di semua hitungan: itu uang pindah kantong sendiri,
  // bukan pengeluaran maupun pemasukan.
  const [
    {
      data: { user },
    },
    { data: terbaru },
    { data: keluarIni },
    { data: masukIni },
    { data: keluarLalu },
    { count: draft },
    { data: rerata, error: rerataError },
    { data: barisTren },
    { data: catatan },
    { data: budgets },
    { kantong, saldo },
  ] = await Promise.all([
    supabase.auth.getUser(),
    // Beranda cuma hari ini & kemarin; selebihnya di Riwayat.
    supabase
      .from("transactions")
      .select("*")
      .in("transaction_date", [hariIni, geserHari(hariIni, -1)])
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("amount, category")
      .eq("type", "expense")
      .eq("status", "confirmed")
      .gte("transaction_date", awalBulanIni),
    supabase
      .from("transactions")
      .select("amount")
      .eq("type", "income")
      .eq("status", "confirmed")
      .gte("transaction_date", awalBulanIni),
    supabase
      .from("transactions")
      .select("amount")
      .eq("type", "expense")
      .eq("status", "confirmed")
      .gte("transaction_date", awalBulanLalu)
      .lt("transaction_date", awalBulanIni),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review"),
    supabase.rpc("get_avg_monthly_expense_by_category"),
    supabase
      .from("transactions")
      .select("amount, type, transaction_date")
      .eq("status", "confirmed")
      .in("type", ["income", "expense"])
      .gte("transaction_date", awalTren),
    supabase
      .from("transactions")
      .select("created_at")
      .gte("created_at", new Date(sekarang.getTime() - HARI_STREAK * 86_400_000).toISOString()),
    supabase.from("budgets").select("category, amount"),
    ambilKantong(supabase),
  ]);

  return (
    <BerandaView
      email={user?.email ?? null}
      ringkasan={{
        keluar: jumlahkan(keluarIni),
        masuk: jumlahkan(masukIni),
        keluarBulanLalu: jumlahkan(keluarLalu),
      }}
      draft={draft ?? 0}
      terbaru={(terbaru ?? []) as Transaction[]}
      rerata={(rerata ?? []) as AvgMonthlyExpenseRow[]}
      rerataError={rerataError?.message ?? null}
      tren={trenBulanan(barisTren ?? [], sekarang, BULAN_TREN)}
      kantong={kantong.map((k) => ({ id: k.id, name: k.name, kind: k.kind, emoji: k.emoji, saldo: saldo.get(k.id) ?? 0 }))}
      budget={progresBudget(budgets ?? [], keluarIni ?? [])}
      streak={hitungStreak((catatan ?? []).map((c) => c.created_at as string), sekarang)}
    />
  );
}
