"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarClock, CalendarDays, NotebookPen, UserRound, Wallet } from "lucide-react";
import { Field, GalatForm, InputNominal, Lembar, Pesan, Pilih, Spinner, useGalat } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, isoLokal } from "@/lib/format";
import { emojiKantong, pesanGagalKantong, type Kantong } from "@/lib/kantong";
import { arahPindah, EMOJI_ORANG, kelebihanBayar, KET_SELISIH_KARTU, SALDO_PER_PINJAMAN, type ArahPinjaman } from "@/lib/pinjaman";
import { cekJatuhTempo } from "@/lib/transaksi-input";
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
 * `kantongUang` = sumber uang tanpa tujuan tabungan (`kantongSumber`).
 * Bayar tagihan kartu melebihi tagihan di aplikasi → tawarkan mencatat
 * selisihnya sebagai biaya kartu (SPEC-perbaikan-temuan C1).
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
  const { galat, gagal, bersihkan } = useGalat({ nama, nominal, kantong: kantongId, jatuh_tempo: jatuhTempo, tanggal });
  const pakaiJatuhTempo = (arah === "beri" || arah === "pinjam") && pihak?.kind !== "kredit";
  // Bayar tagihan kartu lebih dari tagihan di aplikasi: biasanya bunga, iuran, atau belanja yang belum dicatat.
  const lebih = pihak?.kind === "kredit" && arah === "bayar" ? kelebihanBayar(pihak.saldo, Number(nominal) || 0) : 0;

  async function simpan(e?: FormEvent, catatSelisih = false) {
    e?.preventDefault();
    bersihkan();
    const namaBersih = nama.trim().replace(/\s+/g, " ");
    if (!pihak && !namaBersih) return gagal("Namanya diisi dulu.", "nama");
    if (namaBersih.length > 40) return gagal("Namanya kepanjangan, maksimal 40 huruf.", "nama");
    if (!(Number(nominal) > 0)) return gagal("Nominalnya harus lebih dari nol.", "nominal");
    if (!kantongId) return gagal("Pilih kantongnya dulu.", "kantong");
    const tempo = pakaiJatuhTempo ? cekJatuhTempo(tanggal, jatuhTempo) : null;
    if (tempo) return gagal(tempo, "jatuh_tempo");

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
        if (err) throw new Error(await pesanGagalKantong(db, err, namaBersih, null, dbErrorMessage(err, `Kantong "${namaBersih}"`)));
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

      // Selisihnya dicatat sebagai pengeluaran Biaya dari kartu itu: tagihan jadi Rp 0.
      if (catatSelisih && lebih > 0) {
        const res2 = await fetch("/api/catat-manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: lebih,
            type: "expense",
            category: "fees",
            transaction_date: tanggal,
            merchant: target.name,
            description: KET_SELISIH_KARTU,
            kantong_id: target.id,
          }),
        });
        const hasil2 = (await res2.json().catch(() => ({}))) as { error?: string };
        if (!res2.ok) {
          router.refresh();
          throw new Error(`Pembayaran tersimpan, selisihnya belum: ${hasil2.error ?? "gagal nyimpen."}`);
        }
      }

      // Jatuh tempo: diisi saat meminjam/meminjamkan; dibuang begitu lunas.
      const lunas = (arah === "terima_bayar" || arah === "bayar") && Number(nominal) >= sisa;
      if (target.kind === "orang" && (pakaiJatuhTempo || lunas)) {
        await db.from("user_accounts").update({ jatuh_tempo: lunas ? null : jatuhTempo || null }).eq("id", target.id);
      }

      onClose();
      router.refresh();
    } catch (err) {
      gagal(err instanceof Error && !("code" in err) ? err.message : dbErrorMessage(err));
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
      isian={[nama, nominal, kantongId, tanggal, jatuhTempo, keterangan]}
      onClose={() => !loading && onClose()}
      pil={[
        { label: "Batal", batal: true, disabled: loading },
        { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
      ]}
    >
      <form onSubmit={simpan} className={s.form}>
        {pihak && sisa > 0 && (arah === "terima_bayar" || arah === "bayar") && (
          <p className={s.redup} style={{ margin: "0 8px" }}>
            Sisa {arah === "terima_bayar" ? "yang belum dibayar" : "utang"}: <strong className={s.nominal}>{fmtIDR(sisa)}</strong>
          </p>
        )}

        <GalatForm value={galat}>
          <div className={`${s.blok} ${s.blokForm}`}>
            {!pihak && (
              <Field label={arah === "beri" ? "Dipinjamkan ke" : "Dipinjam dari"} ikon={UserRound} kolom="nama">
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
            <Field label="Nominal (Rp)" ikon={Banknote} kolom="nominal">
              <InputNominal required value={nominal} onChange={setNominal} placeholder="Nominal (Rp)" />
            </Field>
            {lebih > 0 && (
              <div style={{ padding: "0 12px 8px" }}>
                <Pesan
                  jenis="peringatan"
                  aksi={
                    <span className={s.chipsBungkus}>
                      <button type="button" className={`${s.chip} ${s.tekan}`} disabled={loading} onClick={() => void simpan(undefined, true)}>
                        Catat selisihnya sebagai biaya kartu
                      </button>
                      <button type="button" className={`${s.chip} ${s.tekan}`} disabled={loading} onClick={() => void simpan()}>
                        Simpan saja
                      </button>
                    </span>
                  }
                >
                  Lebih {fmtIDR(lebih)} dari tagihan di aplikasi. Biasanya ada bunga, iuran, atau belanja kartu yang belum dicatat.
                </Pesan>
              </div>
            )}
            <Pilih
              label={LABEL_KANTONG[arah]}
              ikon={Wallet}
              kolom="kantong"
              nilai={kantongId}
              kosong="Pilih kantong"
              pilihan={kantongUang.map((k) => ({ id: k.id, label: k.name, emoji: emojiKantong(k) }))}
              onChange={setKantongId}
            />
            <Field label="Tanggal" ikon={CalendarDays} kolom="tanggal">
              <input type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </Field>
            {pakaiJatuhTempo && (
              <Field label="Jatuh tempo" ikon={CalendarClock} keterangan="Opsional. Untuk mengingatkan kapan dibayar." kolom="jatuh_tempo">
                <input type="date" value={jatuhTempo} min={tanggal} onChange={(e) => setJatuhTempo(e.target.value)} aria-label="Jatuh tempo" />
              </Field>
            )}
            <Field label="Keterangan" ikon={NotebookPen}>
              <textarea rows={1} value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Keterangan" />
            </Field>
          </div>
        </GalatForm>

        {galat && !galat.kolom && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}
        <button type="submit" hidden />
      </form>
    </Lembar>
  );
}
