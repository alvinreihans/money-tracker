"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";

/**
 * Hapus transaksi. Dua langkah, karena ini tidak bisa dibatalkan — sekali
 * kehapus, struknya harus difoto ulang.
 */
export default function DeleteTransactionButton({ id }: { id: string }) {
  const router = useRouter();
  const [konfirmasi, setKonfirmasi] = useState(false);
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

  if (!konfirmasi) {
    return (
      // Terisi penuh merah. Sebelumnya warnanya cuma muncul saat hover — dan
      // di HP hover tidak ada, jadi tombolnya selamanya tampak teks abu biasa.
      //
      // Teksnya Dark Void, bukan putih: putih di atas merah ini cuma 2,70:1,
      // sedangkan Dark Void 6,55:1. Kasusnya sama persis dengan tombol oranye.
      <button
        onClick={() => setKonfirmasi(true)}
        className="flex min-h-11 items-center rounded-md px-4 text-sm font-semibold transition hover:opacity-90"
        style={{ background: "var(--danger)", color: "#151419" }}
      >
        Hapus transaksi
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground">Yakin mau dihapus? Nggak bisa dibalikin.</p>
      <div className="flex gap-2">
        <button
          onClick={() => void hapus()}
          disabled={loading}
          className="flex min-h-11 items-center rounded-md bg-[var(--danger)] px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Ngapus..." : "Ya, hapus"}
        </button>
        <button
          onClick={() => setKonfirmasi(false)}
          disabled={loading}
          className="flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
        >
          Batal
        </button>
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
