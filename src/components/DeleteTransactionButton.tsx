"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";

/**
 * Hapus transaksi. Konfirmasinya lewat modal yang memutus alur — sekali
 * kehapus, struknya harus difoto ulang.
 */
export default function DeleteTransactionButton({ id }: { id: string }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hapus() {
    setLoading(true);
    setError(null);

    const { error: err } = await createSupabaseBrowserClient()
      .from("transactions")
      .delete()
      .eq("id", id);

    if (err) {
      setError(dbErrorMessage(err));
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  function tutup() {
    if (loading) return;
    setBuka(false);
    setError(null);
  }

  return (
    <>
      <Button onClick={() => setBuka(true)}>Hapus</Button>

      <Modal
        visible={buka}
        onDismiss={tutup}
        header="Hapus transaksi ini?"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" disabled={loading} onClick={tutup}>
                Batal
              </Button>
              <Button variant="primary" loading={loading} onClick={() => void hapus()}>
                Ya, hapus
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>Nggak bisa dibalikin. Kalau ini dari struk, kamu harus foto ulang.</Box>
          {error && <Alert type="error">{error}</Alert>}
        </SpaceBetween>
      </Modal>
    </>
  );
}
