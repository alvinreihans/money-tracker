"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
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
    <Container
      header={
        <Header
          variant="h2"
          actions={
            !buka && (
              <Button iconName="edit" onClick={() => setBuka(true)}>
                Edit
              </Button>
            )
          }
        >
          {draft ? "Betulkan transaksi" : "Edit transaksi"}
        </Header>
      }
    >
      {buka ? (
        <form onSubmit={simpan}>
          <Form
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" formAction="none" disabled={loading} onClick={batal}>
                  Batal
                </Button>
                <Button variant="primary" formAction="submit" loading={loading}>
                  Simpan
                </Button>
              </SpaceBetween>
            }
            errorText={error}
          >
            <SpaceBetween size="l">
              <TransactionFields nilai={nilai} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />
              {draft && (
                <Alert type="info">
                  Begitu disimpan, tanda &ldquo;Perlu dibenerin&rdquo; hilang dan transaksinya ikut
                  dihitung di laporan.
                </Alert>
              )}
            </SpaceBetween>
          </Form>
        </form>
      ) : (
        <Box color="text-body-secondary">Ada yang kebaca salah? Betulkan lewat tombol Edit.</Box>
      )}
    </Container>
  );
}
