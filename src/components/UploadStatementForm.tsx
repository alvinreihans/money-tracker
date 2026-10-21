"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Pesan } from "@/components/oneui";
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

/** Isi dialog "Impor rekening koran". Tombol Impor-nya ada di kaki dialog. */
export function useImporRekeningKoran() {
  const router = useRouter();
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

  function pilih(f: File | null) {
    setFile(f);
    setResult(null);
    setError(null);
  }

  return { file, loading, error, result, impor, pilih };
}

export default function UploadStatementForm({ impor }: { impor: ReturnType<typeof useImporRekeningKoran> }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={s.form}>
      <span className={s.redup}>
        PDF dari aplikasi bank. Pindahan antar kantong sendiri nggak dihitung pengeluaran, dan yang
        udah ada bukti bayarnya nggak bakal kecatat dua kali.
      </span>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          impor.pilih(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        className={`${s.baris} ${s.blok}`}
        style={{ background: "var(--blok-2)" }}
        onClick={() => inputRef.current?.click()}
        disabled={impor.loading}
      >
        <span className={s.barisIkon} style={{ background: "var(--blok)" }}>
          <FileText size={20} />
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul}>{impor.file ? impor.file.name : "Pilih PDF"}</span>
          <span className={s.redup}>{impor.file ? "Ketuk buat ganti" : "Dari penyimpanan HP"}</span>
        </span>
      </button>

      {impor.loading && <ProcessingMessage tahap={TAHAP_STATEMENT} />}
      {impor.error && <Pesan jenis="bahaya">{impor.error}</Pesan>}

      {impor.result && (
        <Pesan jenis="sukses" judul={`${impor.result.inserted} transaksi masuk dari ${impor.result.account}`}>
          {impor.result.parsed} baris kebaca dari PDF
          {impor.result.skippedReimport > 0 && <>, {impor.result.skippedReimport} udah pernah diimpor</>}
          {impor.result.skippedSuperseded > 0 && <>, {impor.result.skippedSuperseded} udah ada bukti bayarnya</>}.
          <details>
            <summary>Rincian per halaman</summary>
            <pre className={s.pre}>{impor.result.notes.join("\n")}</pre>
          </details>
        </Pesan>
      )}
    </div>
  );
}
