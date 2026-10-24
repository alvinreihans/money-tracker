import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hitungStreak, progresBudget, trenBulanan } from "@/lib/analitik";
import { isoLokal } from "@/lib/format";
import { rentangBulan } from "@/lib/periode";
import AnalitikView from "./AnalitikView";
import type { AvgMonthlyExpenseRow } from "@/types/transaction";

export const dynamic = "force-dynamic";

const BULAN_TREN = 6;
// ponytail: streak dihitung dari catatan 90 hari terakhir; lebih dari itu
// tetap tampil "90 hari". Pindahkan ke RPC kalau ada yang betah selama itu.
const HARI_STREAK = 90;

/** Tab Analitik (SPEC-navigasi): grafik yang dulu di Beranda. */
export default async function AnalitikPage() {
  const supabase = await createSupabaseServerClient();
  const sekarang = new Date();
  const { awalBulanIni } = rentangBulan(sekarang);
  const [tahun, bulan] = isoLokal(sekarang).split("-").map(Number);
  const idxAwalTren = tahun * 12 + (bulan - 1) - (BULAN_TREN - 1);
  const awalTren = `${Math.floor(idxAwalTren / 12)}-${String((idxAwalTren % 12) + 1).padStart(2, "0")}-01`;

  // Transfer dikecualikan di semua hitungan: itu uang pindah kantong sendiri,
  // bukan pengeluaran maupun pemasukan.
  const [{ data: barisTren }, { data: rerata, error: rerataError }, { data: catatan }, { data: budgets }] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount, type, category, transaction_date")
      .eq("status", "confirmed")
      .in("type", ["income", "expense"])
      .gte("transaction_date", awalTren),
    supabase.rpc("get_avg_monthly_expense_by_category"),
    supabase
      .from("transactions")
      .select("created_at")
      .gte("created_at", new Date(sekarang.getTime() - HARI_STREAK * 86_400_000).toISOString()),
    supabase.from("budgets").select("category, amount"),
  ]);

  // Bulan ini diambil dari baris tren (sudah memuat 6 bulan), tanpa query lagi.
  const bulanIni = (barisTren ?? []).filter((t) => t.transaction_date >= awalBulanIni);
  const jumlah = (type: string) => bulanIni.filter((t) => t.type === type).reduce((n, t) => n + Number(t.amount), 0);

  return (
    <AnalitikView
      ringkasan={{ keluar: jumlah("expense"), masuk: jumlah("income") }}
      tren={trenBulanan(barisTren ?? [], sekarang, BULAN_TREN)}
      rerata={(rerata ?? []) as AvgMonthlyExpenseRow[]}
      rerataError={rerataError?.message ?? null}
      budget={progresBudget(budgets ?? [], bulanIni)}
      streak={hitungStreak((catatan ?? []).map((c) => c.created_at as string), sekarang)}
    />
  );
}
