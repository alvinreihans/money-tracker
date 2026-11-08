"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tandaTransaksi } from "@/components/kategori";
import { Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { bacaPetunjuk } from "@/lib/petunjuk";
import { fmtIDR, fmtTanggal, JENIS } from "@/lib/format";
import { namaKategori, type Kategori } from "@/lib/kategori";
import { NAMA_KELOMPOK, type Kelompok } from "@/lib/metode";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fmtJam } from "@/lib/waktu";
import type { Transaction } from "@/types/transaction";

/**
 * Kartu "Periksa dulu" (docs/specs/SPEC-periksa-dulu.md §1): rincian hasil Catat
 * yang sudah lengkap tapi belum tersimpan (draft, belum dihitung). Simpan =
 * tombol utama selebar kartu, langsung terfokus (Enter menyimpan); Ubah membuka
 * form dengan isian terbaca; Buang menghapus draft (bisa diurungkan).
 */
export default function KartuPeriksa({
  tx,
  foto,
  kategori,
  kantong,
  sibuk = false,
  fokus = false,
  menyimpan = false,
  catatan,
  onSimpan,
  onUbah,
  onBuang,
}: {
  tx: Transaction;
  /** Thumbnail gambarnya (URL), bila dari gambar. */
  foto?: string | null;
  kategori: Kategori[];
  kantong: { id: string; name: string }[];
  sibuk?: boolean;
  /** Fokuskan tombol Simpan begitu kartu muncul (ketikan: Enter = Simpan, K2). */
  fokus?: boolean;
  /** "Menyimpan…" di tombol Simpan. */
  menyimpan?: boolean;
  /** Keterangan tambahan di atas tombol, mis. kenapa tidak ikut Simpan semua. */
  catatan?: string | null;
  onSimpan: () => void;
  onUbah: () => void;
  onBuang: () => void;
}) {
  const simpanRef = useRef<HTMLButtonElement>(null);
  const db = useMemo(() => createSupabaseBrowserClient(), []);
  // Biaya admin / cashback yang menempel (ikut tersimpan bersama induknya).
  const [ikutan, setIkutan] = useState<{ type: string; amount: number }[]>([]);
  useEffect(() => {
    let batal = false;
    void db
      .from("transactions")
      .select("type, amount")
      .eq("induk_id", tx.id)
      .then(({ data }) => {
        if (!batal) setIkutan(((data ?? []) as { type: string; amount: number }[]).map((x) => ({ type: x.type, amount: Number(x.amount) })));
      });
    return () => {
      batal = true;
    };
  }, [db, tx.id]);
  useEffect(() => {
    if (fokus) simpanRef.current?.focus({ preventScroll: true });
  }, [fokus, tx.id]);

  const pindah = tx.type === "transfer";
  const { ikon: Ikon, warna } = tandaTransaksi({ ...tx, status: "confirmed" }, kategori);
  const nama = namaKategori(kategori, tx.category, tx.type);
  const tujuan = kantong.find((k) => k.id === tx.kantong_tujuan_id)?.name;
  const kelompok = tx.type === "expense" ? ((tx.kelompok ?? tx.kelompok_efektif) as Kelompok | null) : null;
  const biaya = ikutan.find((x) => x.type === "expense");
  const cashback = ikutan.find((x) => x.type === "income");
  const ragu = bacaPetunjuk(tx.bukti_transfer).ragu;
  const tanda = tx.type === "expense" ? "−" : tx.type === "income" ? "+" : "";
  const rincian: [string, string | null | undefined][] = [
    ["Jenis", JENIS[tx.type]],
    ["Kategori", pindah ? null : [nama, kelompok ? NAMA_KELOMPOK[kelompok] : null].filter(Boolean).join(" · ")],
    [pindah ? "Dari → ke" : "Kantong", pindah ? `${tx.payment_method ?? "—"} → ${tujuan ?? "—"}` : tx.payment_method],
    ["Tanggal", [fmtTanggal(tx.transaction_date), fmtJam(tx.waktu)].filter(Boolean).join(" · ")],
    [tx.cicilan_id ? "Cicilan" : "Keterangan", tx.description],
    ["Biaya admin", biaya ? fmtIDR(biaya.amount) : null],
    ["Cashback", cashback ? fmtIDR(cashback.amount) : null],
    ["Paylater", tx.paylater],
  ];

  return (
    <div className={`${s.kartuHasil} ${s.kartuPeriksa}`} role="group" aria-label="Periksa dulu sebelum disimpan">
      <div className={`${s.tersimpan} ${s.tanyaKartu}`}>Periksa dulu · belum tersimpan</div>
      <div className={s.baris}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="Gambar yang dibaca" className={s.thumbPeriksa} />
        ) : (
          <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
            <Ikon size={20} />
          </span>
        )}
        <span className={s.barisTeks}>
          <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>{tx.merchant ?? nama}</span>
        </span>
        <span className={s.nominal}>
          {tanda}
          {fmtIDR(Number(tx.amount))}
        </span>
      </div>
      <dl className={s.rincianPeriksa}>
        {rincian
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {ragu && <p className={s.peringatan} style={{ margin: "8px 0 0", fontSize: 14 }}>Hasil bacanya kurang yakin. Cek nominal & tanggalnya ya.</p>}
      {catatan && <p className={s.redup} style={{ margin: "8px 0 0", fontSize: 14 }}>{catatan}</p>}
      <div className={s.aksiPeriksa}>
        <button ref={simpanRef} type="button" className={`${s.tombol} ${s.tombolPenuh}`} disabled={sibuk} onClick={onSimpan}>
          {menyimpan ? <Spinner /> : "Simpan"}
        </button>
        <div>
          <button type="button" className={`${s.flat} ${s.flatNetral}`} style={{ fontSize: "inherit" }} disabled={sibuk} onClick={onBuang}>
            Buang
          </button>
          <button type="button" className={s.flat} disabled={sibuk} onClick={onUbah}>
            Ubah
          </button>
        </div>
      </div>
    </div>
  );
}
