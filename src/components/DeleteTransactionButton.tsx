"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useCatat } from "@/components/Catat";
import { Konfirmasi } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";

/**
 * Hapus transaksi. Konfirmasinya lewat dialog di bawah layar (panduan One UI
 * untuk dialog konfirmasi). Transaksi yang sudah selesai masih bisa
 * diurungkan lewat snackbar (SPEC-catat-tuntas): barisnya — beserta cashback/
 * biaya admin yang menempel — disimpan dulu, lalu dimasukkan lagi dengan id
 * yang sama. Yang belum selesai tidak bisa: foto struknya ikut terhapus.
 */
export default function DeleteTransactionButton({ id, kembali, draft = false }: { id: string; kembali: string; draft?: boolean }) {
  const router = useRouter();
  const { kabari } = useCatat();
  const [buka, setBuka] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hapus() {
    setLoading(true);
    setError(null);

    const db = createSupabaseBrowserClient();
    // Salinan untuk Urungkan: induknya dulu, lalu ikutan (cashback/biaya
    // admin), bagian pecahannya, dan transfer pelengkap tujuan tabungan —
    // semuanya ikut terhapus bersamanya.
    const { data: salinan } = draft
      ? { data: null }
      : await db.from("transactions").select("*").or(`id.eq.${id},induk_id.eq.${id},pecahan_dari.eq.${id},pelengkap_tujuan.eq.${id}`);
    const { error: err } = await db.from("transactions").delete().eq("id", id);

    if (err) {
      setError(dbErrorMessage(err));
      setLoading(false);
      return;
    }

    // Kembali ke halaman asal. replace, bukan push: tombol Kembali HP tidak
    // boleh membuka lagi detail transaksi yang sudah terhapus.
    router.replace(kembali);
    router.refresh();
    const baris = (salinan ?? []).sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    kabari(
      "Transaksi dihapus",
      baris.length
        ? {
            label: "Urungkan",
            jalankan: async () => {
              for (const b of baris) {
                const { error: gagal } = await db.from("transactions").insert(b);
                if (gagal) return kabari(`Gagal mengurungkan: ${dbErrorMessage(gagal)}`);
              }
              kabari("Transaksi dikembalikan");
              router.refresh();
            },
          }
        : undefined,
    );
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
        <Konfirmasi tanya="Hapus transaksi ini?" ya="Hapus" loading={loading} error={error} onBatal={tutup} onYa={() => void hapus()}>
          {draft ? "Nggak bisa dibalikin. Kalau ini dari struk, kamu harus foto ulang." : "Masih bisa diurungkan sesaat setelah dihapus."}
        </Konfirmasi>
      )}
    </>
  );
}
