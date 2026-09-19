import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import MonthlyStats, { rentangBulan } from "@/components/MonthlyStats";
import { fmtIDR, fmtTanggal, labelKategori, TYPE_BADGE } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

/**
 * Daftar transaksi, tanpa batasan tanggal apa pun.
 *
 * Chart rata-rata sengaja cuma menghitung 3 bulan penuh terakhir supaya
 * rata-ratanya tidak bias oleh bulan berjalan. Benar secara statistik, tapi
 * akibatnya apa pun yang baru diunggah tidak kelihatan di mana-mana. Daftar
 * ini yang menutupi itu.
 *
 * Server Component: ikut ter-refresh oleh router.refresh() setelah upload.
 */
export default async function RecentTransactions() {
  const supabase = await createSupabaseServerClient();

  const { awalBulanIni, awalBulanLalu } = rentangBulan();

  const jumlahkan = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  // Transfer dikecualikan di mana-mana: itu cuma uang pindah kantong sendiri,
  // bukan pengeluaran maupun pemasukan.
  const [{ data: daftarData }, { data: keluarIni }, { data: masukIni }, { data: keluarLalu }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("transactions")
        .select("amount")
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
    ]);

  const daftar = (daftarData ?? []) as Transaction[];

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900">
          Transaksi
        </h3>
        <p className="text-sm text-slate-500">
          Klik salah satu buat lihat detailnya.
        </p>
      </div>

      <div className="p-6 pt-0">
        <MonthlyStats
          keluar={jumlahkan(keluarIni)}
          masuk={jumlahkan(masukIni)}
          keluarBulanLalu={jumlahkan(keluarLalu)}
        />

        {daftar.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Belum ada apa-apa. Upload struk dulu di atas.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {daftar.map((t) => {
              const badge = TYPE_BADGE[t.type] ?? TYPE_BADGE.expense;
              const draft = t.status === "needs_review";

              return (
                <li key={t.id}>
                  <Link
                    href={`/transactions/${t.id}`}
                    className="-mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-900">
                          {t.merchant ?? "Tanpa nama"}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-xs ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {draft && (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">
                            Perlu dibenerin
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {fmtTanggal(t.transaction_date)} · {labelKategori(t.category)}
                        {t.payment_method ? ` · ${t.payment_method}` : ""}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 text-sm font-medium tabular-nums ${
                        t.type === "income" ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {t.type === "income" ? "+" : ""}
                      {fmtIDR(Number(t.amount))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
