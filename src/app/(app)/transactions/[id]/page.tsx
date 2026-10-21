import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DeleteTransactionButton from "@/components/DeleteTransactionButton";
import EditTransactionForm from "@/components/EditTransactionForm";
import {
  Alert,
  Badge,
  Box,
  Breadcrumbs,
  Container,
  ContentLayout,
  Header,
  KeyValuePairs,
  SpaceBetween,
} from "@/components/ui";
import { fmtIDR, fmtTanggal, fmtWaktu, JENIS, labelKategori, labelSumber } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // RLS sudah membatasi ke baris milik user, jadi tidak ketemu = tidak ada
  // ATAU bukan miliknya — keduanya sama-sama 404 dari sisi user.
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const t = data as Transaction;

  const jenis = JENIS[t.type] ?? JENIS.expense;
  const draft = t.status === "needs_review";
  const nama = t.merchant ?? "Tanpa nama";

  // Baris kosong dilewati: label tanpa isi cuma bikin rincian terlihat bolong.
  const rincian = [
    { label: "Jenis", value: <Badge color={jenis.color}>{jenis.label}</Badge> },
    { label: "Kategori", value: labelKategori(t.category) },
    { label: "Metode bayar", value: t.payment_method },
    { label: "Rekening", value: t.account },
    { label: "Lawan transaksi", value: t.counterparty },
    { label: "Keterangan", value: t.description },
    { label: "Masuk lewat", value: labelSumber(t.source) },
    { label: "Dicatat", value: fmtWaktu(t.created_at) },
  ].filter((r) => r.value);

  return (
    <ContentLayout
      breadcrumbs={
        <Breadcrumbs
          items={[
            { text: "Riwayat", href: "/riwayat" },
            { text: nama, href: `/transactions/${t.id}` },
          ]}
        />
      }
      header={
        <Header
          variant="h1"
          description={`${nama} · ${fmtTanggal(t.transaction_date)}`}
          actions={<DeleteTransactionButton id={t.id} />}
        >
          {t.type === "income" ? "+" : ""}
          {fmtIDR(Number(t.amount))}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {draft && (
          <Alert type="warning" header="Perlu dibenerin">
            Struk atau teksnya nggak berhasil dibaca, jadi nominalnya belum benar dan belum ikut
            dihitung di laporan. Betulkan lewat form di bawah.
          </Alert>
        )}

        <Container header={<Header variant="h2">Rincian</Header>}>
          <KeyValuePairs columns={2} items={rincian} />
        </Container>

        {draft && (
          <Container header={<Header variant="h2">Teks yang sempat kebaca</Header>}>
            {t.raw_ocr_text ? (
              <Box variant="pre">{t.raw_ocr_text}</Box>
            ) : (
              <Box color="text-body-secondary">Nggak ada teks yang kebaca sama sekali.</Box>
            )}
          </Container>
        )}

        <EditTransactionForm tx={t} />
      </SpaceBetween>
    </ContentLayout>
  );
}
