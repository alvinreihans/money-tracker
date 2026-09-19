"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import ProcessingMessage, { TAHAP_STATEMENT } from "@/components/ProcessingMessage";
import { IconUnggah } from "@/components/icons";

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
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload-statement", {
        method: "POST",
        body: formData,
      });
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
    <div className="w-full rounded-[var(--radius-lg)] border border-border bg-card shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          Impor Rekening Koran
        </h3>
        <p className="text-sm text-muted-foreground">
          Upload PDF rekening koran dari aplikasi bank. Pindahan antar kantong
          sendiri nggak dihitung pengeluaran, dan yang udah ada bukti bayarnya
          nggak bakal kecatat dua kali.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-6 pt-0">
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
        />

        <button
          type="submit"
          disabled={!file || loading}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          <IconUnggah />
          {loading ? "Lagi diproses..." : "Impor"}
        </button>

        {loading && (
          <ProcessingMessage tahap={TAHAP_STATEMENT} className="text-sm text-muted-foreground" />
        )}

        {error && (
          <p className="rounded-md border border-[rgba(255,107,91,0.45)] bg-[rgba(255,107,91,0.14)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
        )}

        {result && (
          <div className="rounded-md border border-[rgba(74,222,128,0.45)] bg-[rgba(74,222,128,0.14)] px-4 py-3 text-sm text-[var(--success)]">
            <p className="font-medium">
              {result.inserted} transaksi masuk dari {result.account}
            </p>
            <ul className="mt-1 space-y-0.5 text-[var(--success)]">
              <li>{result.parsed} baris kebaca dari PDF</li>
              {result.skippedReimport > 0 && (
                <li>
                  {result.skippedReimport} dilewatin — udah pernah diimpor
                </li>
              )}
              {result.skippedSuperseded > 0 && (
                <li>
                  {result.skippedSuperseded} dilewatin — udah ada bukti
                  bayarnya
                </li>
              )}
            </ul>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-[var(--success)]">
                Rincian per halaman
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[rgba(74,222,128,0.45)] bg-[rgba(74,222,128,0.14)] p-2 text-xs">
                {result.notes.join("\n")}
              </pre>
            </details>
          </div>
        )}
      </form>
    </div>
  );
}
