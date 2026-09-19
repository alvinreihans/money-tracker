import Link from "next/link";
import { fmtIDR, fmtTanggal, labelKategori } from "@/lib/format";
import type { Transaction, TransactionType } from "@/types/transaction";

/**
 * Daftar transaksi yang bisa diklik. Dipakai di beranda (dipotong) maupun di
 * halaman Riwayat (penuh).
 */

const CHIPS: Record<TransactionType, { label: string; warna: string; bg: string }> = {
  expense: { label: "Keluar", warna: "var(--danger)", bg: "rgba(192,57,43,0.10)" },
  income: { label: "Masuk", warna: "var(--success)", bg: "rgba(43,87,65,0.10)" },
  transfer: { label: "Pindah kantong", warna: "var(--transfer)", bg: "rgba(91,74,138,0.12)" },
};

/**
 * Warna nominal. Pengeluaran sengaja memakai warna teks biasa, bukan merah:
 * belanja bukan kesalahan, dan mewarnai semuanya merah membuat penanda merah
 * yang sungguhan penting — draft yang salah baca — jadi tidak terlihat.
 */
function warnaNominal(t: Transaction): string {
  if (t.status === "needs_review") return "var(--danger)";
  if (t.type === "income") return "var(--success)";
  if (t.type === "transfer") return "var(--transfer)";
  return "var(--foreground)";
}

export default function TransactionList({ items }: { items: Transaction[] }) {
  return (
    <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-border">
      {items.map((t, i) => {
        const chip = CHIPS[t.type] ?? CHIPS.expense;
        const draft = t.status === "needs_review";

        return (
          <li key={t.id} className={i > 0 ? "border-t border-border" : ""}>
            <Link
              href={`/transactions/${t.id}`}
              className="flex items-start justify-between gap-3 bg-card px-4 py-3 hover:bg-secondary"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-card-foreground">
                    {t.merchant ?? "Tanpa nama"}
                  </span>
                  <span
                    className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                    style={{ color: chip.warna, background: chip.bg }}
                  >
                    {chip.label}
                  </span>
                  {draft && (
                    <span
                      className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold"
                      style={{ color: "var(--danger)", background: "rgba(192,57,43,0.10)" }}
                    >
                      Perlu dibenerin
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmtTanggal(t.transaction_date)} · {labelKategori(t.category)}
                  {t.payment_method ? ` · ${t.payment_method}` : ""}
                </p>
              </div>

              <span
                className="shrink-0 text-sm font-semibold tabular-nums"
                style={{ color: warnaNominal(t) }}
              >
                {t.type === "income" ? "+" : ""}
                {fmtIDR(Number(t.amount))}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
