import NextLink from "next/link";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  Car,
  CircleEllipsis,
  Clapperboard,
  HeartPulse,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtTanggal, labelKategori } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

/**
 * Daftar transaksi berkelompok ala One UI: tiap baris dengan ikon berwadah,
 * di dalam focus block membulat. Di Riwayat dikelompokkan per tanggal dengan
 * subheader, jadi tanggal tidak perlu diulang di setiap baris.
 */

const IKON_KATEGORI: Record<string, LucideIcon> = {
  food: Utensils,
  groceries: ShoppingBasket,
  transport: Car,
  shopping: ShoppingBag,
  health: HeartPulse,
  entertainment: Clapperboard,
  bills: Receipt,
  other: CircleEllipsis,
};

/**
 * Pengeluaran sengaja memakai warna teks biasa, bukan merah: belanja bukan
 * kesalahan, dan mewarnai semuanya merah membuat penanda yang sungguhan
 * penting — draft yang salah baca — jadi tidak terlihat.
 */
function kelasNominal(t: Transaction): string {
  if (t.status === "needs_review") return s.bahaya;
  if (t.type === "income") return s.masuk;
  if (t.type === "transfer") return s.pindah;
  return "";
}

function Baris({ t, tanpaTanggal }: { t: Transaction; tanpaTanggal: boolean }) {
  const Ikon =
    t.type === "income" ? ArrowDownLeft : t.type === "transfer" ? ArrowLeftRight : IKON_KATEGORI[t.category] ?? CircleEllipsis;
  const rincian = [tanpaTanggal ? null : fmtTanggal(t.transaction_date), labelKategori(t.category), t.payment_method]
    .filter(Boolean)
    .join(" · ");

  return (
    <NextLink href={`/transactions/${t.id}`} className={s.baris}>
      <span className={`${s.barisIkon} ${kelasNominal(t)}`} aria-hidden>
        <Ikon size={20} />
      </span>
      <span className={s.barisTeks}>
        <span className={s.barisJudul}>{t.merchant ?? "Tanpa nama"}</span>
        <span className={s.redup}>{rincian}</span>
        {t.status === "needs_review" && <span className={`${s.lencana} ${s.lencanaBahaya}`}>Perlu dibenerin</span>}
      </span>
      <span className={`${s.nominal} ${kelasNominal(t)}`}>
        {t.type === "income" ? "+" : ""}
        {fmtIDR(Number(t.amount))}
      </span>
    </NextLink>
  );
}

export default function TransactionList({
  items,
  perTanggal = false,
}: {
  items: Transaction[];
  perTanggal?: boolean;
}) {
  if (!perTanggal) {
    return (
      <div className={s.blok}>
        {items.map((t) => (
          <Baris key={t.id} t={t} tanpaTanggal={false} />
        ))}
      </div>
    );
  }

  // Data sudah terurut menurut tanggal dari query, jadi cukup dipecah urut.
  const kelompok: { tanggal: string; isi: Transaction[] }[] = [];
  for (const t of items) {
    const akhir = kelompok[kelompok.length - 1];
    if (akhir?.tanggal === t.transaction_date) akhir.isi.push(t);
    else kelompok.push({ tanggal: t.transaction_date, isi: [t] });
  }

  return kelompok.map((k) => (
    <section key={k.tanggal} style={{ display: "contents" }}>
      <h2 className={s.subheader}>{fmtTanggal(k.tanggal)}</h2>
      <div className={s.blok}>
        {k.isi.map((t) => (
          <Baris key={t.id} t={t} tanpaTanggal />
        ))}
      </div>
    </section>
  ));
}
