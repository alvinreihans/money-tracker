import { createSupabaseServerClient } from "@/lib/supabase/server";
import CatatTransaksi from "@/components/CatatTransaksi";
import RingkasanBulan from "@/components/RingkasanBulan";
import SpendingByCategoryChart from "@/components/SpendingByCategoryChart";
import TransactionTable from "@/components/TransactionTable";
import UploadStatementForm from "@/components/UploadStatementForm";
import { Alert, Box, ContentLayout, Header, NavButton, SpaceBetween } from "@/components/ui";
import { rentangBulan } from "@/lib/periode";
import type { AvgMonthlyExpenseRow, Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

const JUMLAH_DI_BERANDA = 6;

export default async function BerandaPage() {
  const supabase = await createSupabaseServerClient();
  const { awalBulanIni, awalBulanLalu } = rentangBulan();

  const jumlahkan = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  // Transfer dikecualikan di semua hitungan: itu uang pindah kantong sendiri,
  // bukan pengeluaran maupun pemasukan.
  const [
    { data: terbaru },
    { data: keluarIni },
    { data: masukIni },
    { data: keluarLalu },
    { count: draft },
    { data: rerata, error: rerataError },
  ] = await Promise.all([
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
    supabase.rpc("get_avg_monthly_expense_by_category"),
  ]);

  const daftar = (terbaru ?? []) as Transaction[];
  const jumlahDraft = draft ?? 0;

  return (
    <ContentLayout header={<Header variant="h1">Beranda</Header>}>
      <SpaceBetween size="l">
        <RingkasanBulan
          keluar={jumlahkan(keluarIni)}
          masuk={jumlahkan(masukIni)}
          keluarBulanLalu={jumlahkan(keluarLalu)}
        />

        {jumlahDraft > 0 && (
          <Alert
            type="warning"
            header={`${jumlahDraft} transaksi perlu dibenerin`}
            action={<NavButton href="/riwayat?filter=draft">Benerin</NavButton>}
          >
            Nominalnya belum kebaca, jadi belum ikut dihitung di ringkasan.
          </Alert>
        )}

        <CatatTransaksi />

        <TransactionTable
          items={daftar}
          header={
            <Header
              variant="h2"
              description="Klik salah satu buat lihat detailnya."
              actions={daftar.length > 0 && <NavButton href="/riwayat">Lihat semua</NavButton>}
            >
              Transaksi terbaru
            </Header>
          }
          empty={
            <Box textAlign="center" color="inherit">
              Belum ada apa-apa. Catat transaksi pertamamu di atas.
            </Box>
          }
        />

        <SpendingByCategoryChart
          data={(rerata ?? []) as AvgMonthlyExpenseRow[]}
          error={rerataError?.message ?? null}
        />

        <UploadStatementForm />
      </SpaceBetween>
    </ContentLayout>
  );
}
