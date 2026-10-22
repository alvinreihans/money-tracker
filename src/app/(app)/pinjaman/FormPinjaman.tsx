"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarClock, CalendarDays, NotebookPen, UserRound, Wallet } from "lucide-react";
import { Field, InputNominal, Lembar, Pesan, Pilih, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, isoLokal } from "@/lib/format";
import { emojiKantong, type Kantong } from "@/lib/kantong";
import { arahPindah, EMOJI_ORANG, SALDO_PER_PINJAMAN, type ArahPinjaman } from "@/lib/pinjaman";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const JUDUL: Record<ArahPinjaman, string> = {
  beri: "Pinjamkan uang",
  terima_bayar: "Terima bayaran",
  pinjam: "Pinjam uang",
  bayar: "Bayar",
};

const LABEL_KANTONG: Record<ArahPinjaman, string> = {
  beri: "Dari kantong",
  terima_bayar: "Masuk ke",
  pinjam: "Masuk ke",
  bayar: "Dari kantong",
};

type KantongSaldo = Kantong & { saldo: number };

/**
 * Satu catatan Lend & Borrow, disimpan sebagai pindah kantong antara kantong
 * uang dan kantong orang/kartu (arahPindah). Orang baru dibuatkan kantongnya.
 * `pihak` terisi bila dibuka dari baris orang/kartu (nama tidak perlu diisi).
 */
export default function FormPinjaman({
  userId,
  arah,
  pihak,
  orang,
  kantongUang,
  onClose,
}: {
  userId: string;
  arah: ArahPinjaman;
  pihak: KantongSaldo | null;
  orang: KantongSaldo[];
  kantongUang: KantongSaldo[];
  onClose: () => void;
}) {
  const router = useRouter();
  // Sisa yang mau dilunasi: bayaran dari Lend, atau utang di Borrow.
  const sisa = pihak ? Math.abs(pihak.saldo) : 0;
  const [nama, setNama] = useState(pihak?.name ?? "");
  const [nominal, setNominal] = useState(
    (arah === "terima_bayar" || arah === "bayar") && sisa ? String(Math.round(sisa)) : "",
  );
  const [kantongId, setKantongId] = useState(kantongUang.find((k) => k.bawaan)?.id ?? kantongUang[0]?.id ?? "");
  const [tanggal, setTanggal] = useState(isoLokal(new Date()));
  const [jatuhTempo, setJatuhTempo] = useState(pihak?.jatuh_tempo ?? "");
  const [keterangan, setKeterangan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pakaiJatuhTempo = (arah === "beri" || arah === "pinjam") && pihak?.kind !== "kredit";

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const namaBersih = nama.trim().replace(/\s+/g, " ");
    if (!pihak && !namaBersih) return setError("Namanya diisi dulu.");
    if (namaBersih.length > 40) return setError("Namanya kepanjangan, maksimal 40 huruf.");
    if (!(Number(nominal) > 0)) return setError("Nominalnya harus lebih dari nol.");
    if (!kantongId) return setError("Pilih kantongnya dulu.");

    setLoading(true);
    try {
      const db = createSupabaseBrowserClient();
      // Orang yang sudah ada dipakai lagi (tanpa beda huruf besar-kecil); yang baru dibuatkan.
      let target = pihak ?? orang.find((o) => o.name.toLowerCase() === namaBersih.toLowerCase()) ?? null;
      if (!target) {
        const { data, error: err } = await db
          .from("user_accounts")
          .insert({ user_id: userId, name: namaBersih, kind: "orang", emoji: EMOJI_ORANG, saldo_awal: 0, saldo_per: SALDO_PER_PINJAMAN })
          .select()
          .single();
        if (err) throw err;
        target = { ...(data as Kantong), saldo: 0 };
      }

      const { dari, ke } = arahPindah(arah, kantongId, target.id);
      const res = await fetch("/api/catat-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: nominal,
          type: "transfer",
          category: "other",
          transaction_date: tanggal,
          merchant: target.name,
          description: keterangan || null,
          kantong_id: dari,
          kantong_tujuan_id: ke,
        }),
      });
      const hasil = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(hasil.error ?? "Gagal nyimpen.");

      // Jatuh tempo: diisi saat meminjam/meminjamkan; dibuang begitu lunas.
      const lunas = (arah === "terima_bayar" || arah === "bayar") && Number(nominal) >= sisa;
      if (target.kind === "orang" && (pakaiJatuhTempo || lunas)) {
        await db.from("user_accounts").update({ jatuh_tempo: lunas ? null : jatuhTempo || null }).eq("id", target.id);
      }

      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && !("code" in err) ? err.message : dbErrorMessage(err));
      setLoading(false);
    }
  }

  const judul = !pihak
    ? JUDUL[arah]
    : pihak.kind === "kredit"
      ? `${arah === "bayar" ? "Bayar tagihan" : "Pakai"} ${pihak.name}`
      : {
          beri: `Pinjamkan ke ${pihak.name}`,
          terima_bayar: `Terima bayaran dari ${pihak.name}`,
          pinjam: `Pinjam dari ${pihak.name}`,
          bayar: `Bayar ke ${pihak.name}`,
        }[arah];

  return (
    <Lembar
      judul={judul}
      posisi="penuh"
      onClose={() => !loading && onClose()}
      pil={[
        { label: "Batal", onClick: onClose, disabled: loading },
        { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
      ]}
    >
      <form onSubmit={simpan} className={s.form}>
        {pihak && sisa > 0 && (arah === "terima_bayar" || arah === "bayar") && (
          <p className={s.redup} style={{ margin: "0 8px" }}>
            Sisa {arah === "terima_bayar" ? "yang belum dibayar" : "utang"}: <strong className={s.nominal}>{fmtIDR(sisa)}</strong>
          </p>
        )}

        <div className={`${s.blok} ${s.blokForm}`}>
          {!pihak && (
            <Field label={arah === "beri" ? "Dipinjamkan ke" : "Dipinjam dari"} ikon={UserRound}>
              <input
                required
                maxLength={40}
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder={arah === "beri" ? "Dipinjamkan ke" : "Dipinjam dari"}
              />
            </Field>
          )}
          {!pihak && orang.length > 0 && (
            <div className={s.chipsBungkus} style={{ padding: "0 20px 8px 60px" }}>
              {orang.slice(0, 8).map((o) => (
                <button key={o.id} type="button" className={`${s.chip} ${s.tekan}`} aria-pressed={nama === o.name} onClick={() => setNama(o.name)}>
                  {o.name}
                </button>
              ))}
            </div>
          )}
          <Field label="Nominal (Rp)" ikon={Banknote}>
            <InputNominal required value={nominal} onChange={setNominal} placeholder="Nominal (Rp)" />
          </Field>
          <Pilih
            label={LABEL_KANTONG[arah]}
            ikon={Wallet}
            nilai={kantongId}
            kosong="Pilih kantong"
            pilihan={kantongUang.map((k) => ({ id: k.id, label: k.name, emoji: emojiKantong(k) }))}
            onChange={setKantongId}
          />
          <Field label="Tanggal" ikon={CalendarDays}>
            <input type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </Field>
          {pakaiJatuhTempo && (
            <Field label="Jatuh tempo" ikon={CalendarClock} keterangan="Opsional. Untuk mengingatkan kapan dibayar.">
              <input type="date" value={jatuhTempo} onChange={(e) => setJatuhTempo(e.target.value)} />
            </Field>
          )}
          <Field label="Keterangan" ikon={NotebookPen}>
            <textarea rows={1} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Keterangan" />
          </Field>
        </div>

        {error && <Pesan jenis="bahaya">{error}</Pesan>}
        <button type="submit" hidden />
      </form>
    </Lembar>
  );
}
