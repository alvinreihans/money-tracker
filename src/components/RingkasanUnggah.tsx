"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import type { ItemStruk } from "@/components/UploadReceiptForm";
import { fmtIDR, fmtTanggalPendek } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

/**
 * Ringkasan unggah banyak gambar (docs/specs/SPEC-lengkapi.md §7): berapa yang
 * melengkapi transaksi yang sudah ada (bisa diurungkan satu per satu, K1),
 * dicatat baru, perlu dicek (dibuka satu per satu dari "Belum selesai"), dan
 * cashback yang menunggu kantong e-wallet-nya (K4).
 */

/** "38 struk: 34 melengkapi transaksi, 2 dicatat baru, 2 perlu dicek". */
export function teksRingkasan(items: ItemStruk[]): string {
  const n = (st: ItemStruk["status"][]) => items.filter((i) => st.includes(i.status)).length;
  const bagian = [
    [n(["dilengkapi"]), "melengkapi transaksi"],
    [n(["ok"]), "dicatat baru"],
    [n(["draft", "ragu"]), "perlu dicek"],
    [n(["dipakai"]), "sudah pernah dipakai"],
    [n(["gagal"]), "gagal"],
  ]
    .filter(([x]) => x)
    .map(([x, t]) => `${x} ${t}`);
  return `${items.length} struk: ${bagian.join(", ") || "selesai"}`;
}

const judulTx = (t: Pick<Transaction, "merchant" | "amount" | "transaction_date"> | null | undefined) =>
  t ? `${t.merchant ?? "Tanpa nama"} · ${fmtIDR(Number(t.amount))} · ${fmtTanggalPendek(t.transaction_date)}` : "Transaksi";

export default function RingkasanUnggah({
  items,
  onUbah,
  onCek,
  onClose,
}: {
  items: ItemStruk[];
  onUbah: (items: ItemStruk[]) => void;
  /** Buka "Belum selesai" untuk yang perlu dicek. */
  onCek: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [cashbackSelesai, setCashbackSelesai] = useState<string | null>(null);

  const dilengkapi = items.filter((i) => i.status === "dilengkapi");
  const baru = items.filter((i) => i.status === "ok");
  const cek = items.filter((i) => i.status === "draft" || i.status === "ragu");
  const dipakai = items.filter((i) => i.status === "dipakai");
  const gagal = items.filter((i) => i.status === "gagal");
  const tertunda = dilengkapi.filter((i) => !i.diurungkan && i.lengkapi?.cashback_tertunda);
  const dompet = tertunda[0]?.lengkapi?.cashback_tertunda?.dompet ?? "ShopeePay";

  async function urungkan(i: ItemStruk) {
    if (!i.lengkapi || sibuk) return;
    setSibuk(i.id);
    setGalat(null);
    const r = await fetch("/api/lengkapi/urungkan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: i.lengkapi.transaction.id, sebelum: i.lengkapi.sebelum, ikutan_id: i.lengkapi.ikutan_id, kantong_baru: i.lengkapi.kantong_baru }),
    }).catch(() => null);
    setSibuk(null);
    if (!r?.ok) return setGalat("Gagal mengurungkan. Coba lagi.");
    onUbah(items.map((x) => (x.id === i.id ? { ...x, diurungkan: true } : x)));
    router.refresh();
  }

  async function catatCashback() {
    setSibuk("cashback");
    setGalat(null);
    const r = await fetch("/api/lengkapi/cashback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dompet, items: tertunda.map((i) => ({ id: i.lengkapi!.transaction.id, nominal: i.lengkapi!.cashback_tertunda!.nominal })) }),
    }).catch(() => null);
    const data = (await r?.json().catch(() => null)) as { dicatat?: number; kantong?: string; error?: string } | null;
    setSibuk(null);
    if (!r?.ok || !data) return setGalat(data?.error ?? "Gagal mencatat cashback-nya.");
    setCashbackSelesai(`${data.dicatat} cashback dicatat di kantong ${data.kantong}.`);
    onUbah(items.map((x) => (tertunda.includes(x) && x.lengkapi ? { ...x, lengkapi: { ...x.lengkapi, cashback_tertunda: null } } : x)));
    router.refresh();
  }

  const bagian = (judul: string, isi: React.ReactNode) => (
    <div className={s.blok}>
      <p className={s.blokIsi} style={{ paddingBottom: 4, margin: 0 }}>
        <strong>{judul}</strong>
      </p>
      {isi}
    </div>
  );

  return (
    <Lembar judul="Hasil unggah" sub={teksRingkasan(items)} posisi="penuh" onClose={onClose} pil={[{ label: "Tutup", batal: true }]}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {galat && <Pesan jenis="bahaya">{galat}</Pesan>}
        {cek.length > 0 &&
          bagian(
            `Perlu dicek (${cek.length})`,
            <div className={s.blokIsi} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className={s.redup}>Tidak terbaca, atau cocok dengan beberapa transaksi. Dibuka satu per satu.</span>
              <div className={s.pilihanJawab}>
                <button type="button" onClick={onCek}>
                  Cek sekarang
                </button>
              </div>
            </div>,
          )}
        {tertunda.length > 0 &&
          bagian(
            `Cashback belum dicatat (${tertunda.length})`,
            <div className={s.blokIsi} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className={s.redup}>
                {fmtIDR(tertunda.reduce((n, i) => n + (i.lengkapi?.cashback_tertunda?.nominal ?? 0), 0))} cashback masuk ke saldo {dompet}, tapi belum ada kantong {dompet}.
              </span>
              <div className={s.pilihanJawab}>
                <button type="button" disabled={Boolean(sibuk)} onClick={() => void catatCashback()}>
                  {sibuk === "cashback" ? <Spinner /> : `Buat kantong ${dompet} & catat`}
                </button>
              </div>
            </div>,
          )}
        {cashbackSelesai && <Pesan jenis="info">{cashbackSelesai}</Pesan>}
        {dilengkapi.length > 0 &&
          bagian(
            `Melengkapi transaksi (${dilengkapi.length})`,
            dilengkapi.map((i) => (
              <div key={i.id} className={s.baris}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>{judulTx(i.diurungkan ? { ...i.lengkapi!.transaction, ...i.lengkapi!.sebelum } as Transaction : i.tx)}</span>
                  <span className={s.redup} style={{ whiteSpace: "normal" }}>
                    {i.diurungkan ? "Diurungkan" : i.lengkapi?.perubahan.join(" · ") || "Tanda sudah dilengkapi"}
                  </span>
                </span>
                {!i.diurungkan && (
                  <button type="button" className={s.flat} disabled={Boolean(sibuk)} onClick={() => void urungkan(i)}>
                    {sibuk === i.id ? <Spinner /> : "Urungkan"}
                  </button>
                )}
              </div>
            )),
          )}
        {baru.length > 0 &&
          bagian(
            `Dicatat baru (${baru.length})`,
            baru.map((i) => (
              <div key={i.id} className={s.baris}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>{i.tx ? judulTx(i.tx) : i.file.name}</span>
                </span>
              </div>
            )),
          )}
        {dipakai.length > 0 &&
          bagian(
            `Sudah pernah dipakai (${dipakai.length})`,
            dipakai.map((i) => (
              <div key={i.id} className={s.baris}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul}>{i.dipakai?.label ?? i.file.name}</span>
                  <span className={s.redup}>Tidak diproses lagi</span>
                </span>
              </div>
            )),
          )}
        {gagal.length > 0 &&
          bagian(
            `Gagal (${gagal.length})`,
            gagal.map((i) => (
              <div key={i.id} className={s.baris}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul}>{i.file.name}</span>
                  <span className={s.redup}>Coba kirim lagi</span>
                </span>
              </div>
            )),
          )}
      </div>
    </Lembar>
  );
}
