"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtTanggalPendek } from "@/lib/format";
import type { CalonPindah } from "@/lib/pindah";

/**
 * Kartu "3 transaksi lama sepertinya pindah ke DANA. Jadikan pindah kantong?"
 * (SPEC-kantong-sendiri A-3): muncul sesudah kantong uang dibuat — dari Profil,
 * obrolan Catat, impor rekening koran, atau layar awal. Tidak ada yang berubah
 * tanpa "Jadikan pindah"; sesudahnya snackbar Urungkan (lewat `onSelesai`).
 */

/** Kunci sessionStorage: kantong dari layar awal yang diperiksa calon pindahnya begitu aplikasi terbuka. */
export const KUNCI_PERIKSA_PINDAH = "periksa-pindah";

export interface DataCalon {
  kantong: { id: string; name: string };
  calon: CalonPindah[];
  kalimat: string;
}

/** GET calon pindah untuk satu kantong; null bila tidak ada calon / gagal. */
export async function muatCalon(kantongId: string): Promise<DataCalon | null> {
  const res = await fetch(`/api/kantong/${kantongId}/calon-pindah`).catch(() => null);
  const d = (await res?.json().catch(() => null)) as Partial<DataCalon> | null;
  return res?.ok && d?.kalimat && d.calon?.length && d.kantong ? (d as DataCalon) : null;
}

/** Urungkan "Jadikan pindah" dengan salinannya; pesan galat atau null. */
export async function urungkanPindah(salinan: unknown[]): Promise<string | null> {
  const res = await fetch("/api/kantong/pindah/urungkan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salinan }) }).catch(() => null);
  const d = (await res?.json().catch(() => null)) as { error?: string } | null;
  return res?.ok ? null : (d?.error ?? "Gagal mengurungkan. Coba lagi.");
}

/** Paling banyak segini baris yang ditampilkan; sisanya disebut jumlahnya. */
const MAKS_BARIS = 5;

export default function KartuCalonPindah({
  data,
  onTutup,
  onSelesai,
}: {
  data: DataCalon;
  onTutup: () => void;
  /** Sudah dijadikan pindah: jumlah & salinan untuk Urungkan. */
  onSelesai: (n: number, salinan: unknown[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const { kantong, calon } = data;

  async function jadikan() {
    setLoading(true);
    setGalat(null);
    const res = await fetch("/api/kantong/pindah", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kantong_id: kantong.id, ids: calon.map((c) => c.id) }),
    }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { n?: number; salinan?: unknown[]; error?: string } | null;
    setLoading(false);
    if (!res?.ok || !d?.salinan) return setGalat(d?.error ?? "Gagal menjadikan pindah kantong. Coba lagi.");
    onSelesai(d.n ?? calon.length, d.salinan);
  }

  return (
    <Lembar
      label={data.kalimat}
      onClose={() => !loading && onTutup()}
      tombol={
        <>
          <button type="button" className={`${s.flat} ${s.flatNetral}`} disabled={loading} onClick={onTutup}>
            Biarkan
          </button>
          <span className={s.pilPemisah} aria-hidden />
          <button type="button" className={`${s.flat} ${s.flatNetral}`} disabled={loading} onClick={() => void jadikan()}>
            {loading ? <Spinner /> : "Jadikan pindah"}
          </button>
        </>
      }
    >
      <p className={s.konfirmasiTanya}>{data.kalimat}</p>
      <p className={s.konfirmasiKet}>
        Nominal & tanggalnya tetap.
        {calon.some((c) => c.gabung) ? ` Yang sudah tercatat di ${kantong.name} dengan nominal sama digabung, tidak jadi dua.` : ""}
      </p>
      <div className={s.blok} style={{ background: "var(--blok-2)", marginTop: 12 }}>
        {calon.slice(0, MAKS_BARIS).map((c) => (
          <div key={c.id} className={s.baris}>
            <span className={s.barisIkon} style={{ background: "color-mix(in srgb, var(--primer) 18%, transparent)", color: "var(--primer)" }} aria-hidden>
              <ArrowLeftRight size={20} />
            </span>
            <span className={s.barisTeks}>
              <span className={s.barisJudul}>{c.arah === "ke" ? `Pindah ke ${kantong.name}` : `Pindah dari ${kantong.name}`}</span>
              <span className={s.redup}>
                {fmtTanggalPendek(c.transaction_date)} · {c.type === "expense" ? "pengeluaran" : "pemasukan"} rekening koran{c.gabung ? " · digabung" : ""}
              </span>
            </span>
            <span className={s.nominal}>{fmtIDR(c.amount)}</span>
          </div>
        ))}
        {calon.length > MAKS_BARIS && (
          <p className={s.redup} style={{ margin: 0, padding: "8px 20px 12px" }}>
            dan {calon.length - MAKS_BARIS} lainnya
          </p>
        )}
      </div>
      {galat && (
        <div style={{ marginTop: 12 }}>
          <Pesan jenis="bahaya">{galat}</Pesan>
        </div>
      )}
    </Lembar>
  );
}
