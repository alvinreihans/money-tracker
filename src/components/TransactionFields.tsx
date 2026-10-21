"use client";

import { FormControl, SegmentedControl, Select, Stack, Textarea, TextInput } from "@primer/react";
import s from "@/components/ui.module.css";
import { CATEGORY_LABEL, isoLokal } from "@/lib/format";
import { TIPE_TRANSAKSI } from "@/lib/transaksi-input";
import type { Transaction, TransactionType } from "@/types/transaction";

/**
 * Isian rincian transaksi. Dipakai bersama oleh catat manual dan form edit,
 * supaya keduanya tidak pelan-pelan berbeda.
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
    <Stack gap="normal">
      {/* Jenis paling atas dan selalu terlihat: menentukan apakah ini masuk
          hitungan pengeluaran atau pemasukan. */}
      <FormControl>
        <FormControl.Label>Jenis</FormControl.Label>
        <SegmentedControl
          fullWidth
          aria-label="Jenis transaksi"
          onChange={(i) => onChange({ type: TIPE_TRANSAKSI[i].id })}
        >
          {TIPE_TRANSAKSI.map((t) => (
            <SegmentedControl.Button key={t.id} selected={nilai.type === t.id}>
              {t.label}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
        {nilai.type === "transfer" && (
          <FormControl.Caption>Pindah kantong tidak dihitung sebagai pengeluaran.</FormControl.Caption>
        )}
      </FormControl>

      <div className={s.formGrid}>
        <FormControl required>
          <FormControl.Label>Nominal (Rp)</FormControl.Label>
          <TextInput
            block
            type="number"
            inputMode="numeric"
            min={1}
            value={nilai.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            placeholder="25000"
          />
        </FormControl>

        <FormControl required>
          <FormControl.Label>Tanggal</FormControl.Label>
          {/* Input tanggal bawaan: di HP muncul kalender sistem. */}
          <TextInput
            block
            type="date"
            value={nilai.transaction_date}
            onChange={(e) => onChange({ transaction_date: e.target.value })}
          />
        </FormControl>

        <FormControl>
          <FormControl.Label>Kategori</FormControl.Label>
          <Select block value={nilai.category} onChange={(e) => onChange({ category: e.target.value })}>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <Select.Option key={value} value={value}>
                {label}
              </Select.Option>
            ))}
          </Select>
        </FormControl>

        <FormControl>
          <FormControl.Label>Merchant</FormControl.Label>
          <TextInput
            block
            value={nilai.merchant}
            onChange={(e) => onChange({ merchant: e.target.value })}
            placeholder="Nama toko atau tempat"
          />
        </FormControl>

        <FormControl>
          <FormControl.Label>Metode bayar</FormControl.Label>
          <TextInput
            block
            value={nilai.payment_method}
            onChange={(e) => onChange({ payment_method: e.target.value })}
            placeholder="Tunai, QRIS, ShopeePay..."
          />
        </FormControl>
      </div>

      <FormControl>
        <FormControl.Label>Keterangan</FormControl.Label>
        <Textarea
          block
          rows={2}
          value={nilai.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </FormControl>
    </Stack>
  );
}
