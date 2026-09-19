import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import HomeHeader from "@/components/HomeHeader";
import TransactionList from "@/components/TransactionList";
import UploadReceiptForm from "@/components/UploadReceiptForm";
import UploadStatementForm from "@/components/UploadStatementForm";
import SpendingByCategoryChart from "@/components/SpendingByCategoryChart";
import { rentangBulan } from "@/lib/periode";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

const JUMLAH_DI_BERANDA = 6;

export default async function BerandaPage() {
  const supabase = await createSupabaseServerClient();
  const { awalBulanIni, awalBulanLalu } = rentangBulan();

  const jumlahkan = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  // Transfer dikecualikan di semua hitungan: itu uang pindah kantong sendiri,
  // bukan pengeluaran maupun pemasukan.
  const [{ data: terbaru }, { data: keluarIni }, { data: masukIni }, { data: keluarLalu }, { count: draft }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(JUMLAH_DI_BERANDA),
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
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "needs_review"),
    ]);

  const daftar = (terbaru ?? []) as Transaction[];
  const jumlahDraft = draft ?? 0;

  return (
    <>
      <HomeHeader
        keluar={jumlahkan(keluarIni)}
        masuk={jumlahkan(masukIni)}
        keluarBulanLalu={jumlahkan(keluarLalu)}
      />

      {jumlahDraft > 0 && (
        <Link
          href="/riwayat?filter=draft"
          className="mx-4 mt-3 flex items-center gap-2.5 rounded-[var(--radius)] px-3.5 py-2.5"
          style={{
            background: "rgba(255,107,91,0.14)",
            border: "1px solid rgba(255,107,91,0.14)",
          }}
        >
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--danger)"
            strokeWidth="2"
            strokeLinecap="round"
            className="mt-0.5 shrink-0"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <span>
            <span
              className="block text-[13px] font-semibold"
              style={{ color: "var(--danger)" }}
            >
              {jumlahDraft} struk perlu dibenerin
            </span>
            <span className="block text-xs text-muted-foreground">
              Nominalnya belum keisi, klik buat benerin.
            </span>
          </span>
        </Link>
      )}

      <div className="space-y-5 px-4 pt-4">
        <UploadReceiptForm />

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-foreground">Transaksi</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Klik salah satu buat lihat detailnya.
              </p>
            </div>
            {daftar.length > 0 && (
              <Link
                href="/riwayat"
                className="-my-2 flex min-h-11 shrink-0 items-center text-xs font-semibold"
                style={{ color: "var(--primary)" }}
              >
                Lihat semua
              </Link>
            )}
          </div>

          {daftar.length === 0 ? (
            <p className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Belum ada apa-apa. Foto struk dulu di atas.
            </p>
          ) : (
            <TransactionList items={daftar} />
          )}
        </section>

        <SpendingByCategoryChart />
        <UploadStatementForm />
      </div>
    </>
  );
}
