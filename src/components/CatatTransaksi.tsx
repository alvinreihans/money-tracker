"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Tabs from "@cloudscape-design/components/tabs";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
import UploadReceiptForm from "@/components/UploadReceiptForm";
import { NavButton } from "@/components/ui";
import { fmtIDR, fmtTanggal, labelKategori } from "@/lib/format";
import { TEKS_MAKS, validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Tiga cara mencatat. Foto struk jadi tab pertama karena itu aksi harian;
 * ketik dan isi manual untuk yang tidak punya struk (parkir, jajan, transfer
 * ke teman) atau struknya keburu hilang.
 *
 * Tab memakai render "lazy": begitu dibuka, isinya tetap terpasang. Tanpa itu,
 * pindah tab di tengah proses struk membuang antreannya.
 */
export default function CatatTransaksi() {
  return (
    <Container header={<Header variant="h2">Catat transaksi</Header>}>
      <Tabs
        tabs={[
          // Label pendek supaya ketiganya muat di layar HP; kalau tidak, tab
          // terakhir tersembunyi di balik panah geser.
          { id: "foto", label: "Foto", content: <UploadReceiptForm />, contentRenderStrategy: "lazy" },
          { id: "ketik", label: "Ketik", content: <KetikTeks />, contentRenderStrategy: "lazy" },
          { id: "manual", label: "Manual", content: <IsiManual />, contentRenderStrategy: "lazy" },
        ]}
      />
    </Container>
  );
}

async function kirimJson(url: string, body: unknown) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      transaction?: Transaction;
      status?: Transaction["status"];
    };
    return res.ok
      ? { ok: true as const, data }
      : { ok: false as const, error: data.error ?? "Gagal nyimpen." };
  } catch {
    return { ok: false as const, error: "Koneksinya bermasalah." };
  }
}

function ringkas(t: Transaction) {
  return `${t.merchant ?? "Tanpa nama"} — ${fmtIDR(Number(t.amount))} · ${labelKategori(t.category)} · ${fmtTanggal(t.transaction_date)}`;
}

function KetikTeks() {
  const router = useRouter();
  const [teks, setTeks] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ tx: Transaction; draft: boolean } | null>(null);

  async function kirim(e: FormEvent) {
    e.preventDefault();
    const bersih = teks.trim();
    if (!bersih) return setError("Teksnya masih kosong.");
    if (bersih.length > TEKS_MAKS) return setError(`Maksimal ${TEKS_MAKS} karakter.`);

    setLoading(true);
    setError(null);
    setHasil(null);

    const r = await kirimJson("/api/catat-teks", { text: bersih });
    setLoading(false);

    if (!r.ok || !r.data.transaction) return setError(r.ok ? "Gagal nyimpen." : r.error);

    setHasil({ tx: r.data.transaction, draft: r.data.status === "needs_review" });
    setTeks("");
    router.refresh();
  }

  return (
    <form onSubmit={kirim}>
      <SpaceBetween size="l">
        <FormField stretch
          label="Tulis transaksinya"
          description="Pakai bahasa sehari-hari. Nominal, tempat, dan cara bayarnya dibaca otomatis."
          constraintText="Contoh: kopi 25rb gopay · gaji masuk 8jt kemarin"
          errorText={error}
        >
          <Input
            value={teks}
            onChange={(e) => setTeks(e.detail.value)}
            placeholder="kopi 25rb gopay"
            disabled={loading}
          />
        </FormField>

        <Button variant="primary" iconName="send" formAction="submit" loading={loading}>
          Catat
        </Button>

        {hasil && (
          <Alert
            type={hasil.draft ? "warning" : "success"}
            header={hasil.draft ? "Nggak kebaca, disimpan jadi draft" : "Tercatat"}
            action={
              <NavButton href={`/transactions/${hasil.tx.id}`}>
                {hasil.draft ? "Benerin" : "Lihat"}
              </NavButton>
            }
          >
            {hasil.draft ? "Nominalnya isi manual ya. Teks yang kamu ketik ikut disimpan." : ringkas(hasil.tx)}
          </Alert>
        )}
      </SpaceBetween>
    </form>
  );
}

function IsiManual() {
  const router = useRouter();
  const [nilai, setNilai] = useState(nilaiAwal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tersimpan, setTersimpan] = useState<Transaction | null>(null);

  async function simpan(e: FormEvent) {
    e.preventDefault();
    // Dicek di sini dulu supaya pesan salahnya langsung muncul; server tetap
    // memeriksa ulang dengan fungsi yang sama.
    const cek = validasiTransaksi({ ...nilai });
    if (!cek.ok) return setError(cek.error);

    setLoading(true);
    setError(null);
    setTersimpan(null);

    const r = await kirimJson("/api/catat-manual", cek.data);
    setLoading(false);

    if (!r.ok || !r.data.transaction) return setError(r.ok ? "Gagal nyimpen." : r.error);

    setTersimpan(r.data.transaction);
    setNilai(nilaiAwal());
    router.refresh();
  }

  return (
    <form onSubmit={simpan}>
      <SpaceBetween size="l">
        <TransactionFields nilai={nilai} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />

        {error && <Alert type="error">{error}</Alert>}

        {tersimpan && (
          <Alert
            type="success"
            header="Tersimpan"
            action={<NavButton href={`/transactions/${tersimpan.id}`}>Lihat</NavButton>}
          >
            {ringkas(tersimpan)}
          </Alert>
        )}

        <Button variant="primary" formAction="submit" loading={loading}>
          Simpan transaksi
        </Button>
      </SpaceBetween>
    </form>
  );
}
