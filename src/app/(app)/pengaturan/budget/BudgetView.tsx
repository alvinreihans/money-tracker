"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KATEGORI } from "@/components/kategori";
import { AppBar, Field, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, KATEGORI_KELUAR } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { rapikanBudget } from "@/lib/transaksi-input";

/**
 * Target pengeluaran bulanan per kategori. Satu form untuk semua kategori:
 * isi nominal untuk memasang target, kosongkan untuk melepasnya. Rerata 3
 * bulan terakhir jadi patokan supaya targetnya tidak asal tebak.
 */
export default function BudgetView({
  userId,
  awal,
  rerata,
}: {
  userId: string;
  awal: Record<string, number>;
  rerata: Record<string, number>;
}) {
  const router = useRouter();
  const [isian, setIsian] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(KATEGORI_KELUAR).map((k) => [k, awal[k] ? String(awal[k]) : ""])),
  );
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "sukses" | "bahaya"; teks: string } | null>(null);
  const total = Object.values(isian).reduce((t, v) => t + (Number(v) > 0 ? Number(v) : 0), 0);

  async function simpan(e: FormEvent) {
    e.preventDefault();
    setPesan(null);
    const cek = rapikanBudget(isian);
    if (!cek.ok) return setPesan({ jenis: "bahaya", teks: cek.error });

    setLoading(true);
    const db = createSupabaseBrowserClient();
    const [pasang, lepas] = await Promise.all([
      cek.simpan.length
        ? db.from("budgets").upsert(cek.simpan.map((b) => ({ ...b, user_id: userId, updated_at: new Date().toISOString() })))
        : { error: null },
      cek.hapus.length ? db.from("budgets").delete().in("category", cek.hapus) : { error: null },
    ]);
    setLoading(false);

    const err = pasang.error ?? lepas.error;
    if (err) return setPesan({ jenis: "bahaya", teks: dbErrorMessage(err) });
    setPesan({ jenis: "sukses", teks: "Budget tersimpan." });
    router.refresh();
  }

  return (
    <>
      <AppBar judul="Budget" sub={total > 0 ? `${fmtIDR(total)} per bulan` : "Batas pengeluaran per bulan"} kembali="/pengaturan" />

      <form className={`${s.isi} ${s.form}`} onSubmit={simpan}>
        <p className={s.redup} style={{ margin: "0 20px" }}>
          Berlaku sama tiap bulan. Kosongkan kalau kategori itu nggak perlu dibatasi.
        </p>

        <div className={`${s.blok} ${s.blokForm}`}>
          {Object.entries(KATEGORI_KELUAR).map(([k, label]) => (
            <Field
              key={k}
              label={label}
              ikon={(KATEGORI[k] ?? KATEGORI.other).ikon}
              keterangan={rerata[k] ? `Rerata ${fmtIDR(rerata[k])}/bulan, 3 bulan terakhir` : undefined}
            >
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={isian[k]}
                onChange={(e) => setIsian((v) => ({ ...v, [k]: e.target.value }))}
                placeholder={label}
              />
            </Field>
          ))}
        </div>

        {pesan && <Pesan jenis={pesan.jenis}>{pesan.teks}</Pesan>}

        <button type="submit" className={s.tombol} disabled={loading}>
          {loading ? <Spinner /> : "Simpan"}
        </button>
      </form>
    </>
  );
}
