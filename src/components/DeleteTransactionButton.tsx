"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";

/**
 * Hapus transaksi. Konfirmasinya lewat dialog di bawah layar (panduan One UI
 * untuk dialog konfirmasi) — sekali kehapus, struknya harus difoto ulang.
 */
export default function DeleteTransactionButton({ id, kembali }: { id: string; kembali: string }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hapus() {
    setLoading(true);
    setError(null);

    const { error: err } = await createSupabaseBrowserClient().from("transactions").delete().eq("id", id);

    if (err) {
      setError(dbErrorMessage(err));
      setLoading(false);
      return;
    }

    // Kembali ke halaman asal. replace, bukan push: tombol Kembali HP tidak
    // boleh membuka lagi detail transaksi yang sudah terhapus.
    router.replace(kembali);
    router.refresh();
  }

  function tutup() {
    if (loading) return;
    setBuka(false);
    setError(null);
  }

  return (
    <>
      <button type="button" className={s.ikonTombol} aria-label="Hapus transaksi" onClick={() => setBuka(true)}>
        <Trash2 size={22} />
      </button>

      {buka && (
        <Lembar
          judul="Hapus transaksi ini?"
          onClose={tutup}
          tombol={
            <>
              <button type="button" className={s.flat} disabled={loading} onClick={tutup}>
                Batal
              </button>
              <button type="button" className={`${s.flat} ${s.flatBahaya}`} disabled={loading} onClick={() => void hapus()}>
                {loading ? <Spinner /> : "Hapus"}
              </button>
            </>
          }
        >
          <span className={s.redup}>Nggak bisa dibalikin. Kalau ini dari struk, kamu harus foto ulang.</span>
          {error && (
            <div style={{ marginTop: 12 }}>
              <Pesan jenis="bahaya">{error}</Pesan>
            </div>
          )}
        </Lembar>
      )}
    </>
  );
}
