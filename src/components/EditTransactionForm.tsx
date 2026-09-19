"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { CATEGORY_LABEL } from "@/lib/format";
import type { Transaction, TransactionType } from "@/types/transaction";

/**
 * Menyunting rincian transaksi.
 *
 * Ini yang menutup lingkaran untuk draft: sebelumnya struk yang gagal dibaca
 * tersimpan bertanda "Perlu dibenerin" tapi tidak ada cara membenerinnya —
 * satu-satunya jalan adalah menghapus lalu mencatat ulang dari nol.
 */

const TIPE: { id: TransactionType; label: string }[] = [
  { id: "expense", label: "Keluar" },
  { id: "income", label: "Masuk" },
  { id: "transfer", label: "Pindah kantong" },
];

const input =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]";

function Kolom({
  label,
  htmlFor,
  children,
  bantuan,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  bantuan?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {bantuan && <p className="mt-1 text-xs text-muted-foreground">{bantuan}</p>}
    </div>
  );
}

export default function EditTransactionForm({ tx }: { tx: Transaction }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(String(tx.amount));
  const [type, setType] = useState<TransactionType>(tx.type);
  const [category, setCategory] = useState(tx.category);
  const [merchant, setMerchant] = useState(tx.merchant ?? "");
  const [paymentMethod, setPaymentMethod] = useState(tx.payment_method ?? "");
  const [tanggal, setTanggal] = useState(tx.transaction_date);
  const [description, setDescription] = useState(tx.description ?? "");

  const draft = tx.status === "needs_review";

  async function simpan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const nominal = Number(amount);
    if (!Number.isFinite(nominal) || nominal <= 0) {
      setError("Nominalnya harus lebih dari nol.");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    const { error: err } = await supabase
      .from("transactions")
      .update({
        amount: nominal,
        type,
        category,
        merchant: merchant.trim() || null,
        payment_method: paymentMethod.trim() || null,
        transaction_date: tanggal,
        description: description.trim() || null,
        // Begitu dibetulkan manual, nominalnya sudah bisa dipercaya — jadi
        // ikut dihitung di laporan dan penanda merahnya dilepas.
        status: "confirmed",
        raw_ocr_text: null,
      })
      .eq("id", tx.id);

    if (err) {
      setError(dbErrorMessage(err));
      setLoading(false);
      return;
    }

    setBuka(false);
    setLoading(false);
    router.refresh();
  }

  if (!buka) {
    return (
      <button
        onClick={() => setBuka(true)}
        className="flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        {draft ? "Betulkan transaksi" : "Edit transaksi"}
      </button>
    );
  }

  return (
    <form onSubmit={simpan} className="space-y-4">
      <Kolom label="Nominal" htmlFor="f-amount">
        <input
          id="f-amount"
          type="number"
          inputMode="numeric"
          min={1}
          step="1"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={input}
        />
      </Kolom>

      <Kolom
        label="Jenis"
        htmlFor="f-type"
        bantuan="Pindah kantong tidak dihitung sebagai pengeluaran."
      >
        <select
          id="f-type"
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType)}
          className={input}
        >
          {TIPE.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Kolom>

      <Kolom label="Kategori" htmlFor="f-category">
        <select
          id="f-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={input}
        >
          {Object.entries(CATEGORY_LABEL).map(([slug, label]) => (
            <option key={slug} value={slug}>
              {label}
            </option>
          ))}
        </select>
      </Kolom>

      <Kolom label="Tanggal" htmlFor="f-date">
        <input
          id="f-date"
          type="date"
          required
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className={input}
        />
      </Kolom>

      <Kolom label="Merchant" htmlFor="f-merchant">
        <input
          id="f-merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="Nama toko atau tempat"
          className={input}
        />
      </Kolom>

      <Kolom label="Metode bayar" htmlFor="f-method">
        <input
          id="f-method"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          placeholder="Tunai, QRIS, ShopeePay..."
          className={input}
        />
      </Kolom>

      <Kolom label="Keterangan" htmlFor="f-desc">
        <textarea
          id="f-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Opsional"
          className={input}
        />
      </Kolom>

      {draft && (
        <p className="rounded-md border border-[rgba(74,222,128,0.45)] bg-[rgba(74,222,128,0.14)] px-3 py-2 text-xs text-[var(--success)]">
          Begitu disimpan, tanda &ldquo;Perlu dibenerin&rdquo; hilang dan
          transaksinya ikut dihitung di laporan.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-[rgba(255,107,91,0.45)] bg-[rgba(255,107,91,0.14)] px-3 py-2 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Nyimpen..." : "Simpan"}
        </button>
        <button
          type="button"
          onClick={() => setBuka(false)}
          disabled={loading}
          className="flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
