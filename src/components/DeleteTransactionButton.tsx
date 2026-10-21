"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useConfirm } from "@primer/react";
import { TrashIcon } from "@primer/octicons-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";

/**
 * Hapus transaksi. Konfirmasinya lewat dialog yang memutus alur — sekali
 * kehapus, struknya harus difoto ulang.
 */
export default function DeleteTransactionButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);

  async function hapus() {
    const yakin = await confirm({
      title: "Hapus transaksi ini?",
      content: "Nggak bisa dibalikin. Kalau ini dari struk, kamu harus foto ulang.",
      confirmButtonContent: "Ya, hapus",
      cancelButtonContent: "Batal",
      confirmButtonType: "danger",
    });
    if (!yakin) return;

    setLoading(true);
    const { error } = await createSupabaseBrowserClient().from("transactions").delete().eq("id", id);

    if (error) {
      setLoading(false);
      // Dialog konfirmasi sudah tertutup; kabarkan lewat dialog kedua yang sama.
      await confirm({ title: "Gagal ngapus", content: dbErrorMessage(error), confirmButtonContent: "Oke" });
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="danger" leadingVisual={TrashIcon} loading={loading} onClick={() => void hapus()}>
      Hapus
    </Button>
  );
}
