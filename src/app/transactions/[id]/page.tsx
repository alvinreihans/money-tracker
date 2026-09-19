import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DeleteTransactionButton from "@/components/DeleteTransactionButton";
import {
  fmtIDR,
  fmtTanggal,
  fmtWaktu,
  labelKategori,
  labelSumber,
  TYPE_BADGE,
} from "@/lib/format";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

/** Satu baris keterangan; dilewati kalau nilainya kosong. */
function Baris({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{value}</dd>
    </div>
  );
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS sudah membatasi ke baris milik user, jadi tidak ketemu = tidak ada
  // ATAU bukan miliknya — keduanya sama-sama 404 dari sisi user.
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const t = data as Transaction;

  const badge = TYPE_BADGE[t.type] ?? TYPE_BADGE.expense;
  const draft = t.status === "needs_review";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/"
        className="text-sm text-muted-foreground transition hover:text-foreground"
      >
        ← Balik
      </Link>

      <div className="mt-4 w-full rounded-[var(--radius-lg)] border border-border bg-card shadow-sm">
        <div className="border-b border-border p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs ${badge.cls}`}>
              {badge.label}
            </span>
            {draft && (
              <span className="rounded bg-[rgba(255,107,91,0.14)] px-2 py-0.5 text-xs text-[var(--danger)]">
                Perlu dibenerin
              </span>
            )}
          </div>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
            {t.type === "income" ? "+" : ""}
            {fmtIDR(Number(t.amount))}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.merchant ?? "Tanpa nama"} · {fmtTanggal(t.transaction_date)}
          </p>
        </div>

        <dl className="divide-y divide-border px-6">
          <Baris label="Kategori" value={labelKategori(t.category)} />
          <Baris label="Metode bayar" value={t.payment_method} />
          <Baris label="Rekening" value={t.account} />
          <Baris label="Lawan transaksi" value={t.counterparty} />
          <Baris label="Keterangan" value={t.description} />
          <Baris label="Masuk lewat" value={labelSumber(t.source)} />
          <Baris label="Dicatat" value={fmtWaktu(t.created_at)} />
        </dl>

        {draft && (
          <div className="border-t border-border p-6">
            <p className="text-sm font-medium text-foreground">
              Kenapa perlu dibenerin
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Struknya nggak berhasil dibaca, jadi nominalnya belum benar. Di
              bawah ini teks yang sempat kebaca — pakai itu buat mencatat ulang
              manual.
            </p>
            {t.raw_ocr_text ? (
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] bg-secondary p-3 text-xs text-foreground">
                {t.raw_ocr_text}
              </pre>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Nggak ada teks yang kebaca sama sekali.
              </p>
            )}
          </div>
        )}

        <div className="border-t border-border p-6">
          <DeleteTransactionButton id={t.id} />
        </div>
      </div>
    </main>
  );
}
