"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import ConfirmDialog from "@/components/ConfirmDialog";
import { IconHapus } from "@/components/icons";

/**
 * Hapus transaksi. Konfirmasinya lewat dialog yang memutus alur, bukan tombol
 * yang menyelip di bawah — sekali kehapus, struknya harus difoto ulang.
 */
export default function DeleteTransactionButton({ id }: { id: string }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hapus() {
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.from("transactions").delete().eq("id", id);

    if (err) {
      setError(dbErrorMessage(err));
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Merah terisi penuh. Teksnya Dark Void, bukan putih: putih di atas
          merah ini cuma 2,70:1, sedangkan Dark Void 6,55:1. */}
      <button
        onClick={() => setBuka(true)}
        className="flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold transition hover:opacity-90"
        style={{ background: "var(--danger)", color: "#151419" }}
      >
        <IconHapus />
        Hapus transaksi
      </button>

      {buka && (
        <ConfirmDialog
          judul="Hapus transaksi ini?"
          keterangan="Nggak bisa dibalikin. Kalau ini dari struk, kamu harus foto ulang."
          labelKonfirmasi={loading ? "Ngapus..." : "Ya, hapus"}
          ikon={<IconHapus />}
          loading={loading}
          error={error}
          onKonfirmasi={() => void hapus()}
          onBatal={() => {
            setBuka(false);
            setError(null);
          }}
        />
      )}
    </>
  );
}
