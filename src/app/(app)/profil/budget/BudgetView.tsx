"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useKategori } from "@/components/Catat";
import { tandaKategori } from "@/components/kategori";
import { AppBar, Field, InputNominal, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, isianNominal } from "@/lib/format";
import { kategoriJenis } from "@/lib/kategori";
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
  const kategori = useKategori();
  const keluar = kategoriJenis(kategori, "expense");
  const [isian, setIsian] = useState<Record<string, string>>(() =>
    Object.fromEntries(keluar.map((k) => [k.slug, isianNominal(awal[k.slug])])),
  );
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "sukses" | "bahaya"; teks: string } | null>(null);
  const total = Object.values(isian).reduce((t, v) => t + (Number(v) > 0 ? Number(v) : 0), 0);

  async function simpan(e: FormEvent) {
    e.preventDefault();
    setPesan(null);
    const cek = rapikanBudget(isian, kategori);
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
      <AppBar judul="Budget" sub={total > 0 ? `${fmtIDR(total)} per bulan` : "Batas pengeluaran per bulan"} kembali="/profil" />

      <form className={`${s.isi} ${s.form}`} onSubmit={simpan}>
        <p className={s.redup} style={{ margin: "0 20px" }}>
          Berlaku sama tiap bulan. Kosongkan kalau kategori itu nggak perlu dibatasi.
        </p>

        <div className={`${s.blok} ${s.blokForm}`}>
          {keluar.map(({ slug: k, name: label, ...gaya }) => (
            <Field
              key={k}
              label={label}
              ikon={tandaKategori(gaya).ikon}
              keterangan={rerata[k] ? `Rerata ${fmtIDR(rerata[k])}/bulan, 3 bulan terakhir` : undefined}
            >
              <InputNominal value={isian[k] ?? ""} onChange={(n) => setIsian((v) => ({ ...v, [k]: n }))} placeholder={label} />
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
