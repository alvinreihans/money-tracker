"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, PencilLine } from "lucide-react";
import { useCatat, useKategori } from "@/components/Catat";
import { GalatForm, Lembar, Pesan, Spinner, useGalat } from "@/components/oneui";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
import { useTawaranSerupa } from "@/components/TawaranSerupa";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { barisIkutan, validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Menyunting rincian transaksi di halaman penuh ala form Kontak Samsung.
 *
 * Ini yang menutup lingkaran untuk draft: tanpa ini, struk yang gagal dibaca
 * tersimpan bertanda "Perlu dibenerin" tapi tidak ada cara membenerinnya.
 * Untuk draft pemicunya tombol berwarna (aksi utama halaman itu), selain itu
 * cukup baris daftar.
 */
export default function EditTransactionForm({
  tx,
  ikutan,
  terpecah = false,
}: {
  tx: Transaction;
  /** Biaya admin / cashback yang menempel ke transaksi ini, kalau ada. */
  ikutan?: { id: string; amount: number } | null;
  /** Transaksi yang dipecah: nominal, kategori, kelompok, keterangan diatur per bagian. */
  terpecah?: boolean;
}) {
  const router = useRouter();
  const draft = tx.status === "needs_review";
  const { kantong } = useCatat();
  const kategori = useKategori();
  const [buka, setBuka] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nilai, setNilai] = useState(() => nilaiAwal(tx, undefined, ikutan?.amount));
  const { galat, gagal, bersihkan } = useGalat(nilai);
  const serupa = useTawaranSerupa();

  function bukaForm() {
    setNilai(nilaiAwal(tx, undefined, ikutan?.amount));
    bersihkan();
    setBuka(true);
  }

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    bersihkan();

    const cek = validasiTransaksi({ ...nilai }, { wajibKantong: kantong.length > 0, kategori });
    if (!cek.ok) return gagal(cek.error, cek.kolom);

    setLoading(true);
    const db = createSupabaseBrowserClient();
    const { biaya_admin, cashback, ...kolom } = cek.data;
    const baru = {
      ...kolom,
      // Begitu dibetulkan manual, nominalnya sudah bisa dipercaya — jadi
      // ikut dihitung di laporan dan penanda merahnya dilepas.
      status: "confirmed",
      raw_ocr_text: null,
      // Bukti transfer yang belum dijawab: arahnya kini dipilih di form.
      bukti_transfer: null,
    };
    const { error: err } = await db.from("transactions").update(baru).eq("id", tx.id);
    if (err) {
      setLoading(false);
      return gagal(dbErrorMessage(err));
    }

    // Samakan transaksi ikutan dengan isian: ubah, tambah, atau hapus.
    const tujuan = kantong.find((k) => k.id === kolom.kantong_tujuan_id)?.name;
    const harus = barisIkutan({ ...tx, ...baru }, { biaya_admin, cashback }, tujuan);
    const { error: errIkutan } = harus
      ? ikutan
        ? await db.from("transactions").update(harus).eq("id", ikutan.id)
        : await db.from("transactions").insert(harus)
      : ikutan
        ? await db.from("transactions").delete().eq("id", ikutan.id)
        : { error: null };
    setLoading(false);

    if (errIkutan) return gagal(dbErrorMessage(errIkutan));

    setBuka(false);
    router.refresh();

    // Kategori dibetulkan: tawarkan ikut membetulkan transaksi lain dari
    // merchant yang sama (SPEC-ingat-kategori).
    const merchant = kolom.merchant?.trim();
    if (!terpecah && merchant && kolom.category !== tx.category && (kolom.type === "expense" || kolom.type === "income")) {
      const nama = kategori.find((k) => k.type === kolom.type && k.slug === kolom.category)?.name ?? kolom.category;
      void serupa.tawarkan({ merchant, type: kolom.type, kategori: { slug: kolom.category, name: nama }, kelompok: kolom.kelompok ?? null, kecuali: tx.id });
    }
  }

  return (
    <>
      {draft ? (
        <button type="button" className={s.tombol} onClick={bukaForm}>
          Betulkan sekarang
        </button>
      ) : (
        <button type="button" className={`${s.blok} ${s.baris}`} onClick={bukaForm}>
          <span className={s.barisIkon} aria-hidden>
            <PencilLine size={20} />
          </span>
          <span className={s.barisTeks}>
            <span className={s.barisJudul}>Edit transaksi</span>
            <span className={s.redup}>Ada yang kebaca salah?</span>
          </span>
          <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
        </button>
      )}

      {buka && (
        <Lembar
          judul={draft ? "Betulkan transaksi" : "Edit transaksi"}
          sub={draft ? "Begitu disimpan, transaksinya ikut dihitung di laporan." : undefined}
          posisi="penuh"
          isian={nilai}
          onClose={() => !loading && setBuka(false)}
          pil={[
            { label: "Batal", batal: true, disabled: loading },
            { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
          ]}
        >
          <form onSubmit={simpan} className={s.form}>
            <GalatForm value={galat}>
              <TransactionFields nilai={nilai} terpecah={terpecah} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />
            </GalatForm>
            {galat && !galat.kolom && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}
            <button type="submit" hidden />
          </form>
        </Lembar>
      )}
      {serupa.elemen}
    </>
  );
}
