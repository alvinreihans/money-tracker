import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import TransactionList from "@/components/TransactionList";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

const FILTER = [
  { id: "semua", label: "Semua" },
  { id: "keluar", label: "Keluar" },
  { id: "masuk", label: "Masuk" },
  { id: "pindah", label: "Pindah kantong" },
  { id: "draft", label: "Perlu dibenerin" },
] as const;

export default async function RiwayatPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "semua" } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (filter === "keluar") query = query.eq("type", "expense");
  else if (filter === "masuk") query = query.eq("type", "income");
  else if (filter === "pindah") query = query.eq("type", "transfer");
  else if (filter === "draft") query = query.eq("status", "needs_review");

  const { data } = await query;
  const daftar = (data ?? []) as Transaction[];

  return (
    <main>
      <div className="px-4 pb-3 pt-10">
        <h1 className="text-xl font-bold text-foreground">Riwayat</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Semua transaksi yang pernah tercatat.
        </p>
      </div>

      {/* Filter satu baris di atas daftar, bisa digeser di layar sempit. */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {FILTER.map((f) => {
          const aktif = filter === f.id;
          return (
            <Link
              key={f.id}
              href={f.id === "semua" ? "/riwayat" : `/riwayat?filter=${f.id}`}
              className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold"
              style={
                aktif
                  ? {
                      background: "var(--primary)",
                      color: "var(--primary-foreground)",
                      borderColor: "var(--primary)",
                    }
                  : {
                      background: "var(--card)",
                      color: "var(--muted-foreground)",
                      borderColor: "var(--border)",
                    }
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="px-4 pb-4">
        {daftar.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            {filter === "draft"
              ? "Nggak ada yang perlu dibenerin. Aman."
              : "Belum ada transaksi di sini."}
          </p>
        ) : (
          <TransactionList items={daftar} />
        )}
      </div>
    </main>
  );
}
