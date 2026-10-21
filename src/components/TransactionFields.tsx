"use client";

import ColumnLayout from "@cloudscape-design/components/column-layout";
import DatePicker from "@cloudscape-design/components/date-picker";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import { CATEGORY_LABEL, isoLokal } from "@/lib/format";
import { TIPE_TRANSAKSI } from "@/lib/transaksi-input";
import type { Transaction, TransactionType } from "@/types/transaction";

/**
 * Isian rincian transaksi. Dipakai bersama oleh "Isi manual" (tambah) dan
 * form edit, supaya keduanya tidak pelan-pelan berbeda.
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

export function nilaiAwal(tx?: Transaction): NilaiTransaksi {
  return {
    // Draft yang gagal dibaca bernominal 0; kolom kosong lebih jujur.
    amount: tx && Number(tx.amount) > 0 ? String(tx.amount) : "",
    type: tx?.type ?? "expense",
    category: tx?.category ?? "other",
    transaction_date: tx?.transaction_date ?? isoLokal(new Date()),
    merchant: tx?.merchant ?? "",
    payment_method: tx?.payment_method ?? "",
    description: tx?.description ?? "",
  };
}

const OPSI_TIPE = TIPE_TRANSAKSI.map((t) => ({ value: t.id, label: t.label }));
const OPSI_KATEGORI = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

export default function TransactionFields({
  nilai,
  onChange,
}: {
  nilai: NilaiTransaksi;
  onChange: (patch: Partial<NilaiTransaksi>) => void;
}) {
  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={2}>
        <FormField stretch label="Nominal (Rp)">
          <Input
            type="number"
            inputMode="numeric"
            value={nilai.amount}
            onChange={(e) => onChange({ amount: e.detail.value })}
            placeholder="25000"
          />
        </FormField>

        <FormField stretch label="Jenis" description="Pindah kantong tidak dihitung sebagai pengeluaran.">
          <Select
            selectedOption={OPSI_TIPE.find((o) => o.value === nilai.type) ?? null}
            onChange={(e) => onChange({ type: e.detail.selectedOption.value as TransactionType })}
            options={OPSI_TIPE}
          />
        </FormField>

        <FormField stretch label="Kategori">
          <Select
            selectedOption={OPSI_KATEGORI.find((o) => o.value === nilai.category) ?? null}
            onChange={(e) => onChange({ category: e.detail.selectedOption.value ?? "other" })}
            options={OPSI_KATEGORI}
          />
        </FormField>

        <FormField stretch label="Tanggal">
          <DatePicker
            value={nilai.transaction_date}
            onChange={(e) => onChange({ transaction_date: e.detail.value })}
            placeholder="YYYY/MM/DD"
          />
        </FormField>

        <FormField stretch label="Merchant" constraintText="Opsional">
          <Input
            value={nilai.merchant}
            onChange={(e) => onChange({ merchant: e.detail.value })}
            placeholder="Nama toko atau tempat"
          />
        </FormField>

        <FormField stretch label="Metode bayar" constraintText="Opsional">
          <Input
            value={nilai.payment_method}
            onChange={(e) => onChange({ payment_method: e.detail.value })}
            placeholder="Tunai, QRIS, ShopeePay..."
          />
        </FormField>
      </ColumnLayout>

      <FormField stretch label="Keterangan" constraintText="Opsional">
        <Textarea
          rows={2}
          value={nilai.description}
          onChange={(e) => onChange({ description: e.detail.value })}
        />
      </FormField>
    </SpaceBetween>
  );
}
