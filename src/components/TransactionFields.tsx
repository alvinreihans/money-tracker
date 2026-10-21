"use client";

import { Banknote, CalendarDays, ChevronDown, CreditCard, NotebookPen, Shapes, Store } from "lucide-react";
import { Field, Segmen } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { CATEGORY_LABEL, isoLokal } from "@/lib/format";
import { TIPE_TRANSAKSI } from "@/lib/transaksi-input";
import type { Transaction, TransactionType } from "@/types/transaction";

/**
 * Isian rincian transaksi ala form Kontak Samsung: baris berikon dengan garis
 * bawah, dikelompokkan dalam kartu — yang wajib di kartu pertama, pelengkap
 * di kartu kedua. Dipakai bersama oleh catat manual dan form edit, supaya
 * keduanya tidak pelan-pelan berbeda.
 */

export interface NilaiTransaksi {
  amount: string;
  type: TransactionType;
  category: string;
  transaction_date: string;
  merchant: string;
  payment_method: string;
  description: string;
}

export function nilaiAwal(tx?: Transaction, type: TransactionType = "expense"): NilaiTransaksi {
  return {
    // Draft yang gagal dibaca bernominal 0; kolom kosong lebih jujur.
    amount: tx && Number(tx.amount) > 0 ? String(tx.amount) : "",
    type: tx?.type ?? type,
    category: tx?.category ?? "other",
    transaction_date: tx?.transaction_date ?? isoLokal(new Date()),
    merchant: tx?.merchant ?? "",
    payment_method: tx?.payment_method ?? "",
    description: tx?.description ?? "",
  };
}

export default function TransactionFields({
  nilai,
  onChange,
}: {
  nilai: NilaiTransaksi;
  onChange: (patch: Partial<NilaiTransaksi>) => void;
}) {
  return (
    <div className={s.form}>
      {/* Jenis paling atas dan selalu terlihat: menentukan apakah ini masuk
          hitungan pengeluaran atau pemasukan. */}
      <Segmen
        label="Jenis transaksi"
        // "Pindah kantong" terlalu panjang untuk sepertiga lebar HP; artinya
        // dijelaskan di keterangan di bawahnya begitu dipilih.
        pilihan={TIPE_TRANSAKSI.map((t) => (t.id === "transfer" ? { ...t, label: "Pindah" } : t))}
        nilai={nilai.type}
        onChange={(type) => onChange({ type })}
      />
      {nilai.type === "transfer" && (
        <span className={s.keterangan}>Pindah kantong tidak dihitung sebagai pengeluaran.</span>
      )}

      <div className={`${s.blok} ${s.blokForm}`}>
        <Field label="Nominal (Rp)" ikon={Banknote}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={nilai.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            placeholder="Nominal (Rp)"
          />
        </Field>

        <Field label="Tanggal" ikon={CalendarDays}>
          {/* Input tanggal bawaan: di HP muncul kalender sistem. */}
          <input
            type="date"
            required
            value={nilai.transaction_date}
            onChange={(e) => onChange({ transaction_date: e.target.value })}
          />
        </Field>

        <Field label="Kategori" ikon={Shapes} kanan={<ChevronDown size={22} />}>
          <select value={nilai.category} onChange={(e) => onChange({ category: e.target.value })}>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className={`${s.blok} ${s.blokForm}`}>
        <Field label="Merchant" ikon={Store}>
          <input value={nilai.merchant} onChange={(e) => onChange({ merchant: e.target.value })} placeholder="Merchant" />
        </Field>

        <Field label="Metode bayar" ikon={CreditCard}>
          <input
            value={nilai.payment_method}
            onChange={(e) => onChange({ payment_method: e.target.value })}
            placeholder="Metode bayar"
          />
        </Field>

        <Field label="Keterangan" ikon={NotebookPen}>
          <textarea
            rows={1}
            value={nilai.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Keterangan"
          />
        </Field>
      </div>
    </div>
  );
}
