"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Heading, Stack } from "@primer/react";
import { PencilIcon } from "@primer/octicons-react";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import { validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Menyunting rincian transaksi.
 *
 * Ini yang menutup lingkaran untuk draft: tanpa ini, struk yang gagal dibaca
 * tersimpan bertanda "Perlu dibenerin" tapi tidak ada cara membenerinnya —
 * satu-satunya jalan adalah menghapus lalu mencatat ulang dari nol. Karena
 * itu, untuk draft form-nya langsung terbuka.
 */
export default function EditTransactionForm({ tx }: { tx: Transaction }) {
  const router = useRouter();
  const draft = tx.status === "needs_review";
  const [buka, setBuka] = useState(draft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nilai, setNilai] = useState(() => nilaiAwal(tx));

  async function simpan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const cek = validasiTransaksi({ ...nilai });
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

  function batal() {
    setNilai(nilaiAwal(tx));
    setError(null);
    setBuka(false);
  }

  return (
    <section className={s.kotak}>
      <div className={s.kotakKepala}>
        <Heading as="h2" variant="small">
          {draft ? "Betulkan transaksi" : "Edit transaksi"}
        </Heading>
        {!buka && (
          <Button size="small" leadingVisual={PencilIcon} onClick={() => setBuka(true)}>
            Edit
          </Button>
        )}
      </div>

      <div className={s.kotakIsi}>
        {buka ? (
          <form onSubmit={simpan}>
            <Stack gap="normal">
              <TransactionFields nilai={nilai} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />
              {draft && (
                <Banner
                  variant="info"
                  title="Info"
                  hideTitle
                  description="Begitu disimpan, tanda “Perlu dibenerin” hilang dan transaksinya ikut dihitung di laporan."
                />
              )}
              {error && <Banner variant="critical" title="Gagal" hideTitle description={error} />}
              <Stack direction="horizontal" gap="condensed" justify="end">
                <Button type="button" onClick={batal} disabled={loading}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" loading={loading}>
                  Simpan
                </Button>
              </Stack>
            </Stack>
          </form>
        ) : (
          <span className={s.redup}>Ada yang kebaca salah? Betulkan lewat tombol Edit.</span>
        )}
      </div>
    </section>
  );
}
