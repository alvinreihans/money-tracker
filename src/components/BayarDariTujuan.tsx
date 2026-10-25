"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, PiggyBank, Plus, Target } from "lucide-react";
import { useCatat } from "@/components/Catat";
import { Field, Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR } from "@/lib/format";
import { EMOJI_TUJUAN, kantongTujuan } from "@/lib/tujuan";
import { saldoSejakDari } from "@/lib/waktu";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types/transaction";

/**
 * "Dibayar dari tujuan tabungan" (SPEC-tujuan-tabungan) untuk pengeluaran
 * yang sudah tercatat dari kantong biasa, mis. HP Rp 10,3 jt dari BCA yang
 * uangnya ditabung setahun. Pengeluarannya pindah ke kantong tujuan (jadi di
 * luar jatah bulanan metode); kalau saldo tujuannya kurang, kekurangannya
 * dicatat sebagai transfer pelengkap dari kantong asal di waktu yang sama.
 * Saldo kantong asal tidak berubah sama sekali.
 */
export default function BayarDariTujuan({ tx, total }: { tx: Transaction; total: number }) {
  const router = useRouter();
  const { kantong, kabari } = useCatat();
  const tujuan = kantong.filter(kantongTujuan);
  const dariTujuan = tujuan.find((k) => k.id === tx.kantong_id);
  const [buka, setBuka] = useState(false);
  const [baru, setBaru] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Transfer pelengkap yang menempel (ada = dipindahkan lewat aksi ini, bisa dibatalkan).
  const [pelengkap, setPelengkap] = useState<{ id: string; kantong_id: string | null; payment_method: string | null }[]>([]);

  useEffect(() => {
    if (!dariTujuan) return;
    void createSupabaseBrowserClient()
      .from("transactions")
      .select("id, kantong_id, payment_method")
      .eq("pelengkap_tujuan", tx.id)
      .then(({ data }) => setPelengkap(data ?? []));
  }, [dariTujuan, tx.id]);

  async function pindahkan(t: { id: string; name: string; saldo_per?: string }) {
    const db = createSupabaseBrowserClient();
    const { data: saldo, error: e1 } = await db.rpc("saldo_kantong");
    if (e1) throw e1;
    const ada = Math.max(0, Number((saldo as { id: string; saldo: number }[]).find((x) => x.id === t.id)?.saldo ?? 0));
    // Tujuan yang dibuat sesudah tanggal belanja belum bersaldo saat itu.
    const kurang = t.saldo_per && tx.transaction_date < t.saldo_per ? total : Math.max(0, total - ada);
    if (kurang > 0) {
      const { error: e2 } = await db.from("transactions").insert({
        user_id: tx.user_id,
        amount: kurang,
        type: "transfer",
        category: "other",
        merchant: t.name,
        transaction_date: tx.transaction_date,
        waktu: tx.waktu ?? null,
        kantong_id: tx.kantong_id,
        payment_method: tx.payment_method,
        kantong_tujuan_id: t.id,
        status: "confirmed",
        source: "text",
        pelengkap_tujuan: tx.id,
      });
      if (e2) throw e2;
    }
    // Bagian pecahan ikut pindah lewat trigger pecahan_ikut_asli.
    const { error: e3 } = await db.from("transactions").update({ kantong_id: t.id, payment_method: t.name }).eq("id", tx.id);
    if (e3) throw e3;
    return { asal: { kantong_id: tx.kantong_id, payment_method: tx.payment_method } };
  }

  async function kembalikan(asal: { kantong_id: string | null; payment_method: string | null }) {
    const db = createSupabaseBrowserClient();
    const { error: e1 } = await db.from("transactions").delete().eq("pelengkap_tujuan", tx.id);
    const { error: e2 } = e1 ? { error: e1 } : await db.from("transactions").update(asal).eq("id", tx.id);
    if (e2) return kabari(dbErrorMessage(e2));
    kabari("Dikembalikan ke kantong semula");
    router.refresh();
  }

  async function pilih(t: { id: string; name: string; saldo_per?: string } | null) {
    setLoading(true);
    setError(null);
    try {
      let target = t;
      if (!target) {
        const nama = (baru ?? "").trim().replace(/\s+/g, " ");
        if (!nama) throw new Error("Nama tujuannya diisi dulu.");
        // Tujuan baru untuk belanja ini: target = nominalnya, berlaku sejak tanggal belanja.
        const { data, error: e } = await createSupabaseBrowserClient()
          .from("user_accounts")
          .insert({
            user_id: tx.user_id,
            name: nama.slice(0, 40),
            kind: "tujuan",
            emoji: EMOJI_TUJUAN,
            target: total,
            saldo_awal: 0,
            saldo_per: tx.transaction_date,
            saldo_sejak: saldoSejakDari(tx.transaction_date),
          })
          .select("id, name, saldo_per")
          .single();
        if (e) throw e;
        target = data;
      }
      const { asal } = await pindahkan(target!);
      setBuka(false);
      kabari(`Dibayar dari tujuan ${target!.name}`, { label: "Urungkan", jalankan: () => void kembalikan(asal) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && !("code" in e) ? e.message : dbErrorMessage(e));
    }
    setLoading(false);
  }

  if (dariTujuan) {
    // Dibayar langsung dari tujuan (tanpa pelengkap): kantongnya cukup diubah lewat Ubah transaksi.
    if (!pelengkap.length) return null;
    const asal = { kantong_id: pelengkap[0].kantong_id, payment_method: pelengkap[0].payment_method };
    return (
      <div className={`${s.blok} ${s.baris}`}>
        <span className={s.barisIkon} aria-hidden>
          <PiggyBank size={20} />
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul}>Dibayar dari tujuan {dariTujuan.name}</span>
          <span className={s.redup}>Di luar jatah bulan ini</span>
        </span>
        <button type="button" className={s.flat} style={{ flex: "0 0 auto", padding: "0 12px" }} onClick={() => void kembalikan(asal)}>
          Batalkan
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" className={`${s.blok} ${s.baris} ${s.tekan}`} onClick={() => (setBuka(true), setBaru(null), setError(null))}>
        <span className={s.barisIkon} aria-hidden>
          <PiggyBank size={20} />
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul}>Dibayar dari tujuan tabungan</span>
          <span className={s.redup}>Beli dari tabungan? Tidak dihitung di jatah bulan ini</span>
        </span>
        <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
      </button>

      {buka && (
        <Lembar
          judul="Dibayar dari tujuan tabungan"
          sub={`${fmtIDR(total)} pindah ke tujuan yang dipilih. Kalau saldonya kurang, kekurangannya dicatat sebagai setoran dari kantong semula — saldo kantong itu tidak berubah.`}
          daftar
          onClose={() => !loading && setBuka(false)}
        >
          {tujuan.map((t) => (
            <button key={t.id} type="button" className={`${s.baris} ${s.tekan}`} disabled={loading} onClick={() => void pilih(t)}>
              <span className={s.barisEmoji} aria-hidden>
                {t.emoji || EMOJI_TUJUAN}
              </span>
              <span className={s.barisJudul}>{t.name}</span>
            </button>
          ))}
          {baru == null ? (
            <button type="button" className={`${s.baris} ${s.tekan}`} disabled={loading} onClick={() => setBaru("")}>
              <span className={s.barisIkon} aria-hidden>
                <Plus size={20} />
              </span>
              <span className={s.barisJudul}>Tujuan baru</span>
            </button>
          ) : (
            <form
              className={s.form}
              style={{ padding: "8px 0" }}
              onSubmit={(e) => {
                e.preventDefault();
                void pilih(null);
              }}
            >
              <div className={`${s.blok} ${s.blokForm}`}>
                <Field label="Nama tujuan" ikon={Target} keterangan={`Targetnya ${fmtIDR(total)}, sudah terpakai untuk belanja ini.`}>
                  <input autoFocus maxLength={40} value={baru} onChange={(e) => setBaru(e.target.value)} placeholder="Nama tujuan, mis. HP baru" />
                </Field>
              </div>
              <button type="submit" className={s.tombol} disabled={loading}>
                {loading ? <Spinner /> : "Buat & pindahkan"}
              </button>
            </form>
          )}
          {error && (
            <div style={{ padding: "8px 16px" }}>
              <Pesan jenis="bahaya">{error}</Pesan>
            </div>
          )}
        </Lembar>
      )}
    </>
  );
}
