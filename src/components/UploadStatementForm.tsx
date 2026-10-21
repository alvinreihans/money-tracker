"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import FileUpload from "@cloudscape-design/components/file-upload";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ProcessingMessage, { TAHAP_STATEMENT } from "@/components/ProcessingMessage";

interface ImportResponse {
  parsed: number;
  inserted: number;
  skippedReimport: number;
  skippedSuperseded: number;
  account: string;
  notes: string[];
}

export default function UploadStatementForm() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = files[0];
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
        setFiles([]);
        router.refresh();
      }
    } catch {
      setError("Koneksinya bermasalah.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Upload PDF rekening koran dari aplikasi bank. Pindahan antar kantong sendiri nggak dihitung pengeluaran, dan yang udah ada bukti bayarnya nggak bakal kecatat dua kali."
        >
          Impor rekening koran
        </Header>
      }
    >
      <form onSubmit={handleSubmit}>
        <SpaceBetween size="l">
          <FileUpload
            accept="application/pdf"
            value={files}
            onChange={(e) => {
              setFiles(e.detail.value);
              setResult(null);
              setError(null);
            }}
            showFileSize
          />

          <Button variant="primary" iconName="upload" formAction="submit" disabled={!files.length} loading={loading}>
            Impor
          </Button>

          {loading && <ProcessingMessage tahap={TAHAP_STATEMENT} />}

          {error && <Alert type="error">{error}</Alert>}

          {result && (
            <Alert type="success" header={`${result.inserted} transaksi masuk dari ${result.account}`}>
              <SpaceBetween size="xs">
                <div>
                  <div>{result.parsed} baris kebaca dari PDF</div>
                  {result.skippedReimport > 0 && (
                    <div>{result.skippedReimport} dilewatin — udah pernah diimpor</div>
                  )}
                  {result.skippedSuperseded > 0 && (
                    <div>{result.skippedSuperseded} dilewatin — udah ada bukti bayarnya</div>
                  )}
                </div>
                <ExpandableSection headerText="Rincian per halaman" variant="footer">
                  <Box variant="pre">{result.notes.join("\n")}</Box>
                </ExpandableSection>
              </SpaceBetween>
            </Alert>
          )}
        </SpaceBetween>
      </form>
    </Container>
  );
}
