"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Stack, Text } from "@primer/react";
import { FileIcon, UploadIcon } from "@primer/octicons-react";
import ProcessingMessage, { TAHAP_STATEMENT } from "@/components/ProcessingMessage";
import s from "@/components/ui.module.css";

interface ImportResponse {
  parsed: number;
  inserted: number;
  skippedReimport: number;
  skippedSuperseded: number;
  account: string;
  notes: string[];
}

/** Isi dialog "Impor rekening koran". */
export default function UploadStatementForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function impor() {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload-statement", { method: "POST", body: formData });
      const data: unknown = await res.json();

      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Gagal baca rekening korannya.";
        setError(msg);
      } else {
        setResult(data as ImportResponse);
        setFile(null);
        router.refresh();
      }
    } catch {
      setError("Koneksinya bermasalah.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack gap="normal">
      <Text className={s.redup}>
        PDF dari aplikasi bank. Pindahan antar kantong sendiri nggak dihitung pengeluaran, dan yang
        udah ada bukti bayarnya nggak bakal kecatat dua kali.
      </Text>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setResult(null);
          setError(null);
          e.target.value = "";
        }}
      />

      <Stack direction="horizontal" gap="condensed" align="center" wrap="wrap">
        <Button leadingVisual={FileIcon} onClick={() => inputRef.current?.click()} disabled={loading}>
          {file ? "Ganti PDF" : "Pilih PDF"}
        </Button>
        {file && <Text size="small">{file.name}</Text>}
      </Stack>

      <Button variant="primary" leadingVisual={UploadIcon} disabled={!file} loading={loading} onClick={() => void impor()}>
        Impor
      </Button>

      {loading && <ProcessingMessage tahap={TAHAP_STATEMENT} />}

      {error && <Banner variant="critical" title="Gagal" hideTitle description={error} />}

      {result && (
        <Banner
          variant="success"
          title={`${result.inserted} transaksi masuk dari ${result.account}`}
          description={
            <>
              <div>{result.parsed} baris kebaca dari PDF</div>
              {result.skippedReimport > 0 && <div>{result.skippedReimport} dilewatin — udah pernah diimpor</div>}
              {result.skippedSuperseded > 0 && <div>{result.skippedSuperseded} dilewatin — udah ada bukti bayarnya</div>}
              <details>
                <summary>Rincian per halaman</summary>
                <pre className={s.pre}>{result.notes.join("\n")}</pre>
              </details>
            </>
          }
        />
      )}
    </Stack>
  );
}
