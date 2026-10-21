"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, PencilLine } from "lucide-react";
import { useCatat } from "@/components/Catat";
import { Lembar, Pesan, Spinner } from "@/components/oneui";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Menyunting rincian transaksi di halaman penuh ala form Kontak Samsung.
 *
 * Ini yang menutup lingkaran untuk draft: tanpa ini, struk yang gagal dibaca
 * tersimpan bertanda "Perlu dibenerin" tapi tidak ada cara membenerinnya.
 * Untuk draft pemicunya tombol berwarna (aksi utama halaman itu), selain itu
 * cukup baris daftar.
 */
export default function EditTransactionForm({ tx }: { tx: Transaction }) {
  const router = useRouter();
  const draft = tx.status === "needs_review";
  const { kantong } = useCatat();
  const [buka, setBuka] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nilai, setNilai] = useState(() => nilaiAwal(tx));

  function bukaForm() {
    setNilai(nilaiAwal(tx));
    setError(null);
    setBuka(true);
  }

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    setError(null);

    const cek = validasiTransaksi({ ...nilai }, { wajibKantong: kantong.length > 0 });
    if (!cek.ok) return setError(cek.error);

    setLoading(true);
    const { error: err } = await createSupabaseBrowserClient()
      .from("transactions")
      .update({
        ...cek.data,
        // Begitu dibetulkan manual, nominalnya sudah bisa dipercaya — jadi
        // ikut dihitung di laporan dan penanda merahnya dilepas.
        status: "confirmed",
        raw_ocr_text: null,
      })
      .eq("id", tx.id);
    setLoading(false);

    if (err) return setError(dbErrorMessage(err));

    setBuka(false);
    router.refresh();
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
          onClose={() => !loading && setBuka(false)}
          pil={[
            { label: "Batal", onClick: () => setBuka(false), disabled: loading },
            { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
          ]}
        >
          <form onSubmit={simpan} className={s.form}>
            <TransactionFields nilai={nilai} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />
            {error && <Pesan jenis="bahaya">{error}</Pesan>}
            <button type="submit" hidden />
          </form>
        </Lembar>
      )}
    </>
  );
}
