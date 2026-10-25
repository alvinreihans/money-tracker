"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, NotebookPen, PieChart, Plus, Shapes, Split, Trash2, Banknote } from "lucide-react";
import { useCatat, useKategori } from "@/components/Catat";
import { tandaKategori } from "@/components/kategori";
import { Field, InputNominal, Konfirmasi, Lembar, Pesan, Pilih, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, isianNominal } from "@/lib/format";
import { kategoriJenis } from "@/lib/kategori";
import { KELOMPOK, NAMA_KELOMPOK, type Kelompok } from "@/lib/metode";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types/transaction";

interface Bagian {
  /** Baris yang sudah ada (asli atau bagian); kosong = bagian baru. */
  id: string | null;
  amount: string;
  category: string;
  /** Kosong = ikut kategori. */
  kelompok: string;
  description: string;
}

const dariTx = (t: Transaction): Bagian => ({
  id: t.id,
  amount: isianNominal(t.amount),
  category: t.category,
  kelompok: t.kelompok ?? "",
  description: t.description ?? "",
});

/**
 * Pecah transaksi (SPEC-metode-budget): belanja campuran (minimarket Rp 15 rb
 * = sabun Rp 10 rb kebutuhan + kopi Rp 5 rb keinginan) dibagi jadi beberapa
 * bagian, masing-masing dengan nominal, kategori, kelompok, dan keterangannya.
 * Di database tiap bagian baris sendiri (`pecahan_dari` → transaksi asli),
 * jadi total, filter, dan analitik tetap benar; di layar tetap satu transaksi.
 * Jumlah semua bagian harus sama dengan total semula — saldo tidak berubah.
 */
export default function PecahTransaksi({ tx, bagian }: { tx: Transaction; bagian: Transaction[] }) {
  const router = useRouter();
  const { kabari } = useCatat();
  const kategori = useKategori();
  const total = Number(tx.amount) + bagian.reduce((n, b) => n + Number(b.amount), 0);
  const terpecah = bagian.length > 0;
  const [buka, setBuka] = useState(false);
  const [isian, setIsian] = useState<Bagian[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tanyaGabung, setTanyaGabung] = useState(false);

  const jumlah = isian.reduce((n, b) => n + (Number(b.amount) || 0), 0);
  const selisih = total - jumlah;
  const kelompokBawaan = (slug: string) => NAMA_KELOMPOK[(kategoriJenis(kategori, "expense").find((k) => k.slug === slug)?.kelompok as Kelompok) ?? "keinginan"];

  function mulai() {
    // Belum dipecah: bagian pertama = transaksi ini, bagian kedua kosong.
    setIsian(terpecah ? [dariTx(tx), ...bagian.map(dariTx)] : [{ ...dariTx(tx), amount: isianNominal(total) }, { id: null, amount: "", category: tx.category, kelompok: "", description: "" }]);
    setError(null);
    setBuka(true);
  }

  // Bagian pertama menampung sisanya: ketik "kopi 5.000" → sabun jadi 10.000 sendiri.
  const seimbang = (v: Bagian[]) => {
    const lain = v.slice(1).reduce((n, b) => n + (Number(b.amount) || 0), 0);
    return lain < total ? [{ ...v[0], amount: isianNominal(total - lain) }, ...v.slice(1)] : v;
  };
  const ubah = (i: number, p: Partial<Bagian>) =>
    setIsian((v) => {
      const baru = v.map((b, j) => (j === i ? { ...b, ...p } : b));
      return i > 0 && "amount" in p ? seimbang(baru) : baru;
    });

  async function simpan() {
    setError(null);
    if (isian.some((b) => !(Number(b.amount) > 0))) return setError("Tiap bagian harus punya nominal.");
    if (selisih !== 0) return setError(`Jumlah bagian harus ${fmtIDR(total)} (selisih ${fmtIDR(Math.abs(selisih))}).`);
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const isi = (b: Bagian) => ({ amount: Number(b.amount), category: b.category, kelompok: b.kelompok || null, description: b.description.trim() || null });
    const [asli, ...lain] = isian;
    const tetap = new Set(lain.flatMap((b) => (b.id ? [b.id] : [])));
    const hasil = await Promise.all([
      db.from("transactions").update(isi(asli)).eq("id", tx.id),
      ...lain.filter((b) => b.id).map((b) => db.from("transactions").update(isi(b)).eq("id", b.id!)),
      ...lain
        .filter((b) => !b.id)
        .map((b) =>
          // Tanggal, jam, kantong, merchant, jenis, status disalin trigger dari aslinya.
          db.from("transactions").insert({
            ...isi(b),
            user_id: tx.user_id,
            type: tx.type,
            status: tx.status,
            source: tx.source,
            transaction_date: tx.transaction_date,
            kantong_id: tx.kantong_id,
            pecahan_dari: tx.id,
          }),
        ),
      ...bagian.filter((b) => !tetap.has(b.id)).map((b) => db.from("transactions").delete().eq("id", b.id)),
    ]);
    setLoading(false);
    const gagal = hasil.find((r) => r.error)?.error;
    if (gagal) return setError(dbErrorMessage(gagal));
    setBuka(false);
    kabari(isian.length > 1 ? `Dipecah jadi ${isian.length} bagian` : "Pecahan digabung lagi");
    router.refresh();
  }

  async function gabung() {
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const { error: e1 } = await db.from("transactions").delete().eq("pecahan_dari", tx.id);
    const { error: e2 } = e1 ? { error: null } : await db.from("transactions").update({ amount: total }).eq("id", tx.id);
    setLoading(false);
    if (e1 || e2) return setError(dbErrorMessage((e1 ?? e2)!));
    setTanyaGabung(false);
    setBuka(false);
    kabari("Digabung lagi jadi satu transaksi");
    router.refresh();
  }

  return (
    <>
      <button type="button" className={`${s.blok} ${s.baris} ${s.tekan}`} onClick={mulai}>
        <span className={s.barisIkon} aria-hidden>
          <Split size={20} />
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul}>{terpecah ? "Atur pecahan" : "Pecah transaksi"}</span>
          <span className={s.redup}>{terpecah ? `${bagian.length + 1} bagian` : "Belanja campuran? Mis. sabun & kopi"}</span>
        </span>
        <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
      </button>

      {buka && (
        <Lembar
          judul={terpecah ? "Atur pecahan" : "Pecah transaksi"}
          sub={`Total ${fmtIDR(total)} dibagi ke beberapa bagian. Di daftar tetap tampil satu transaksi.`}
          posisi="penuh"
          isian={isian}
          onClose={() => !loading && setBuka(false)}
          pil={[
            { label: "Batal", batal: true, disabled: loading },
            { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
          ]}
        >
          <div className={s.form}>
            {isian.map((b, i) => (
              <div key={b.id ?? `baru-${i}`} className={`${s.blok} ${s.blokForm}`}>
                <div className={s.budgetAtas} style={{ padding: "12px 20px 0" }}>
                  <strong>Bagian {i + 1}</strong>
                  {i > 0 && (
                    <button type="button" className={s.ikonTombol} aria-label={`Hapus bagian ${i + 1}`} onClick={() => setIsian((v) => seimbang(v.filter((_, j) => j !== i)))}>
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
                <Field label="Nominal (Rp)" ikon={Banknote}>
                  <InputNominal value={b.amount} onChange={(amount) => ubah(i, { amount })} placeholder="Nominal (Rp)" />
                </Field>
                <Pilih
                  label="Kategori"
                  ikon={Shapes}
                  nilai={b.category}
                  pilihan={kategoriJenis(kategori, "expense").map((k) => ({ id: k.slug, label: k.name, ...tandaKategori(k) }))}
                  onChange={(category) => ubah(i, { category })}
                />
                <Pilih
                  label="Kelompok"
                  ikon={PieChart}
                  nilai={b.kelompok}
                  pilihan={[{ id: "", label: `Ikut kategori (${kelompokBawaan(b.category)})` }, ...KELOMPOK.map((k) => ({ id: k, label: NAMA_KELOMPOK[k] }))]}
                  onChange={(kelompok) => ubah(i, { kelompok })}
                />
                <Field label="Keterangan" ikon={NotebookPen}>
                  <input value={b.description} maxLength={500} onChange={(e) => ubah(i, { description: e.target.value })} placeholder="Keterangan, mis. kopi" />
                </Field>
              </div>
            ))}

            <button
              type="button"
              className={`${s.flat}`}
              onClick={() => setIsian((v) => [...v, { id: null, amount: selisih > 0 ? String(selisih) : "", category: tx.category, kelompok: "", description: "" }])}
            >
              <Plus size={18} aria-hidden /> Tambah bagian
            </button>

            <p className={selisih === 0 ? s.redup : s.galat} style={{ margin: "0 20px" }} role="status">
              {selisih === 0 ? `Jumlah ${fmtIDR(jumlah)} ✓` : selisih > 0 ? `Kurang ${fmtIDR(selisih)} dari total ${fmtIDR(total)}` : `Lebih ${fmtIDR(-selisih)} dari total ${fmtIDR(total)}`}
            </p>
            {error && <Pesan jenis="bahaya">{error}</Pesan>}
            {terpecah && (
              <button type="button" className={`${s.flat} ${s.flatBahaya}`} disabled={loading} onClick={() => setTanyaGabung(true)}>
                Gabungkan lagi jadi satu
              </button>
            )}
          </div>
          {tanyaGabung && (
            <Konfirmasi tanya="Gabungkan lagi jadi satu transaksi?" ya="Gabungkan" loading={loading} onBatal={() => setTanyaGabung(false)} onYa={() => void gabung()}>
              {`Semua bagian jadi satu transaksi ${fmtIDR(total)} dengan kategori & kelompok bagian pertama.`}
            </Konfirmasi>
          )}
        </Lembar>
      )}
    </>
  );
}
