import { createSupabaseServerClient } from "@/lib/supabase/server";
import TransactionTable from "@/components/TransactionTable";
import { Box, ContentLayout, Header } from "@/components/ui";
import FilterRiwayat from "./FilterRiwayat";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

const FILTER = [
  { id: "semua", text: "Semua" },
  { id: "keluar", text: "Keluar" },
  { id: "masuk", text: "Masuk" },
  { id: "pindah", text: "Pindah kantong" },
  { id: "draft", text: "Perlu dibenerin" },
];

export default async function RiwayatPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: diminta } = await searchParams;
  const filter = FILTER.some((f) => f.id === diminta) ? diminta! : "semua";
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
    <ContentLayout
      header={
        <Header variant="h1" description="Semua transaksi yang pernah tercatat.">
          Riwayat
        </Header>
      }
    >
      <TransactionTable
        items={daftar}
        header={
          <Header variant="h2" counter={`(${daftar.length})`} actions={<FilterRiwayat aktif={filter} options={FILTER} />}>
            Transaksi
          </Header>
        }
        empty={
          <Box textAlign="center" color="inherit">
            {filter === "draft"
              ? "Nggak ada yang perlu dibenerin. Aman."
              : "Belum ada transaksi di sini."}
          </Box>
        }
      />
    </ContentLayout>
  );
}
