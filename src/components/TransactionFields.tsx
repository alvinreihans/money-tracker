"use client";

import NextLink from "next/link";
import { ArrowDownToLine, BadgePercent, Banknote, CalendarDays, Coins, CreditCard, NotebookPen, Shapes, Store, UserRound, Wallet } from "lucide-react";
import { useCatat, useKategori } from "@/components/Catat";
import { tandaKategori } from "@/components/kategori";
import { Field, Pilih, Segmen } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { isoLokal } from "@/lib/format";
import { emojiKantong } from "@/lib/kantong";
import { kategoriJenis, LAINNYA } from "@/lib/kategori";
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
  kantong_id: string;
  kantong_tujuan_id: string;
  description: string;
  /** Hanya pindah kantong; tersimpan sebagai transaksi ikutan. */
  biaya_admin: string;
  /** Hanya pengeluaran; tersimpan sebagai transaksi ikutan. */
  cashback: string;
}

/** `ikutan`: nominal biaya admin/cashback yang sudah menempel ke `tx`. */
export function nilaiAwal(tx?: Transaction, type: TransactionType = "expense", ikutan?: number): NilaiTransaksi {
  return {
    // Draft yang gagal dibaca bernominal 0; kolom kosong lebih jujur.
    amount: tx && Number(tx.amount) > 0 ? String(tx.amount) : "",
    type: tx?.type ?? type,
    category: tx?.category ?? "other",
    transaction_date: tx?.transaction_date ?? isoLokal(new Date()),
    merchant: tx?.merchant ?? "",
    payment_method: tx?.payment_method ?? "",
    kantong_id: tx?.kantong_id ?? "",
    kantong_tujuan_id: tx?.kantong_tujuan_id ?? "",
    description: tx?.description ?? "",
    biaya_admin: tx?.type === "transfer" && ikutan ? String(ikutan) : "",
    cashback: tx?.type === "expense" && ikutan ? String(ikutan) : "",
  };
}

export default function TransactionFields({
  nilai,
  onChange,
}: {
  nilai: NilaiTransaksi;
  onChange: (patch: Partial<NilaiTransaksi>) => void;
}) {
  const { kantong } = useCatat();
  const kategori = useKategori();
  const { type } = nilai;

  // Pilihan kantong. Nama kantong asal ikut disalin ke payment_method, supaya
  // daftar, saran, dan pencarian tetap memakai teks seperti sebelumnya.
  // Tanpa pilihan "Tanpa kantong": begitu punya kantong, tiap transaksi wajib
  // jelas kantongnya supaya saldonya benar.
  const pilihanKantong = kantong.map((k) => ({ id: k.id, label: k.name, emoji: emojiKantong(k) }));
  const pilihKantong = (kolom: "kantong_id" | "kantong_tujuan_id", label: string, ikon: React.ElementType) => (
    <Pilih
      label={label}
      ikon={ikon}
      nilai={nilai[kolom]}
      pilihan={pilihanKantong}
      kosong="Pilih kantong"
      onChange={(id) =>
        onChange(
          kolom === "kantong_id"
            ? { kantong_id: id, payment_method: kantong.find((k) => k.id === id)?.name ?? "" }
            : { kantong_tujuan_id: id },
        )
      }
    />
  );

  // Isian nominal pelengkap (cashback, biaya admin) — opsional.
  const nominalPelengkap = (kolom: "cashback" | "biaya_admin", label: string, ikon: React.ElementType, ket: string) => (
    <Field label={label} ikon={ikon} keterangan={ket}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={nilai[kolom]}
        onChange={(e) => onChange({ [kolom]: e.target.value })}
        placeholder={label}
      />
    </Field>
  );

  return (
    <div className={s.form}>
      {/* Jenis paling atas dan selalu terlihat: menentukan isian di bawahnya
          dan apakah ini masuk hitungan pengeluaran atau pemasukan. */}
      <Segmen
        label="Jenis transaksi"
        // "Pindah kantong" terlalu panjang untuk sepertiga lebar HP; artinya
        // dijelaskan di keterangan di bawahnya begitu dipilih.
        pilihan={TIPE_TRANSAKSI.map((t) => (t.id === "transfer" ? { ...t, label: "Pindah" } : t))}
        nilai={type}
        onChange={(baru) =>
          // Kategori pengeluaran tidak berlaku untuk pemasukan dan sebaliknya.
          onChange({
            type: baru,
            ...(kategoriJenis(kategori, baru).some((k) => k.slug === nilai.category) ? {} : { category: LAINNYA }),
          })
        }
      />
      {type === "transfer" && <span className={s.keterangan}>Pindah kantong tidak dihitung sebagai pengeluaran.</span>}

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

        {/* Pindah kantong tidak berkategori. */}
        {type !== "transfer" && (
          <Pilih
            label="Kategori"
            ikon={Shapes}
            nilai={nilai.category}
            pilihan={kategoriJenis(kategori, type).map((k) => ({ id: k.slug, label: k.name, ...tandaKategori(k) }))}
            onChange={(category) => onChange({ category })}
          />
        )}

        {kantong.length > 0 ? (
          type === "transfer" ? (
            <>
              {pilihKantong("kantong_id", "Dari kantong", Wallet)}
              {pilihKantong("kantong_tujuan_id", "Ke kantong", ArrowDownToLine)}
            </>
          ) : (
            pilihKantong("kantong_id", type === "income" ? "Masuk ke" : "Bayar pakai", Wallet)
          )
        ) : (
          // Belum punya kantong: tetap bisa menulis metode bayar seperti dulu.
          <Field
            label="Metode bayar"
            ikon={CreditCard}
            keterangan={
              <>
                <NextLink href="/pengaturan/kantong" className={s.tautan}>
                  Tambah kantong
                </NextLink>{" "}
                biar saldonya ikut kehitung.
              </>
            }
          >
            <input
              value={nilai.payment_method}
              onChange={(e) => onChange({ payment_method: e.target.value })}
              placeholder="Metode bayar"
            />
          </Field>
        )}
      </div>

      <div className={`${s.blok} ${s.blokForm}`}>
        {type === "expense" && (
          <Field label="Merchant / toko" ikon={Store}>
            <input value={nilai.merchant} onChange={(e) => onChange({ merchant: e.target.value })} placeholder="Merchant / toko" />
          </Field>
        )}
        {type === "income" && (
          <Field label="Dari siapa" ikon={UserRound}>
            <input value={nilai.merchant} onChange={(e) => onChange({ merchant: e.target.value })} placeholder="Dari siapa" />
          </Field>
        )}

        {type === "expense" &&
          nominalPelengkap("cashback", "Cashback (Rp)", BadgePercent, "Opsional. Dicatat sebagai pemasukan ke kantong yang sama.")}
        {type === "transfer" &&
          nominalPelengkap("biaya_admin", "Biaya admin (Rp)", Coins, "Opsional. Dicatat sebagai pengeluaran dari kantong asal.")}

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
