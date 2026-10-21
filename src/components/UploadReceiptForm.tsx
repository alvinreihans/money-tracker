"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import FileUpload from "@cloudscape-design/components/file-upload";
import FormField from "@cloudscape-design/components/form-field";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import CameraCapture from "@/components/CameraCapture";
import ProcessingMessage from "@/components/ProcessingMessage";
import { fmtIDR, fmtTanggal, labelKategori } from "@/lib/format";
import type { Transaction } from "@/types/transaction";

interface UploadResponse {
  transaction: Transaction;
  status: "confirmed" | "needs_review";
  source: "groq" | "gemini_vision" | "none";
  /** Jejak tiap tahap pipeline. Hanya ditampilkan saat hasilnya jadi draft. */
  notes?: string[];
}

/**
 * Jalur mana yang akhirnya membaca struknya.
 *
 * Ditampilkan karena bedanya nyata buat user, bukan sekadar detail teknis:
 * Gemini punya jatah 20 permintaan per hari, jadi struk yang lolos lewat
 * Tesseract tidak memakan kuota sama sekali, sedangkan yang lewat Gemini
 * mengurangi sisa jatah hari itu.
 */
const SUMBER: Record<UploadResponse["source"], string> = {
  groq: "Tesseract",
  gemini_vision: "Gemini",
  none: "gagal baca",
};

type Status = "antre" | "proses" | "ok" | "draft" | "gagal";

interface Item {
  id: string;
  file: File;
  preview: string;
  status: Status;
  hasil?: UploadResponse;
  pesan?: string;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/heic";

/** Isi tab "Foto struk": kamera atau galeri, lalu diproses satu per satu. */
export default function UploadReceiptForm() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [berjalan, setBerjalan] = useState(false);
  const [kameraBuka, setKameraBuka] = useState(false);

  // Object URL tidak dibebaskan otomatis; tanpa ini memori terus menumpuk
  // kalau user menambah dan menghapus banyak gambar.
  const previewsRef = useRef<string[]>([]);
  useEffect(() => {
    const daftar = previewsRef.current;
    return () => daftar.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function tambahFiles(files: File[]) {
    const baru = files.map((file) => {
      const preview = URL.createObjectURL(file);
      previewsRef.current.push(preview);
      return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        preview,
        status: "antre" as Status,
      };
    });
    setItems((prev) => [...prev, ...baru]);
  }

  function lepasPreview(daftar: Item[]) {
    daftar.forEach((i) => {
      URL.revokeObjectURL(i.preview);
      previewsRef.current = previewsRef.current.filter((u) => u !== i.preview);
    });
  }

  function hapus(id: string) {
    setItems((prev) => {
      lepasPreview(prev.filter((i) => i.id === id));
      return prev.filter((i) => i.id !== id);
    });
  }

  function bersihkan() {
    setItems((prev) => {
      lepasPreview(prev);
      return [];
    });
  }

  function ubah(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function prosesSatu(item: Item) {
    ubah(item.id, { status: "proses" });

    const formData = new FormData();
    formData.append("file", item.file);

    try {
      const res = await fetch("/api/upload-receipt", { method: "POST", body: formData });
      const data: unknown = await res.json();

      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Gagal baca struknya.";
        ubah(item.id, { status: "gagal", pesan: msg });
        return;
      }

      const hasil = data as UploadResponse;
      ubah(item.id, { status: hasil.status === "confirmed" ? "ok" : "draft", hasil });
    } catch {
      ubah(item.id, { status: "gagal", pesan: "Koneksinya bermasalah." });
    }
  }

  async function prosesSemua() {
    setBerjalan(true);
    // Satu per satu, bukan barengan: OCR berat di CPU dan Groq punya batas
    // token per menit. Dikirim serentak justru bikin sebagian kena rate limit.
    for (const item of items) {
      if (item.status === "antre" || item.status === "gagal") {
        await prosesSatu(item);
      }
    }
    setBerjalan(false);
    router.refresh(); // segarkan ringkasan, daftar, dan chart
  }

  const antre = items.filter((i) => i.status === "antre" || i.status === "gagal").length;
  const selesai = items.filter((i) => i.status === "ok" || i.status === "draft").length;

  return (
    <SpaceBetween size="l">
      {kameraBuka && (
        <CameraCapture
          onCapture={(file) => {
            tambahFiles([file]);
            setKameraBuka(false);
          }}
          onClose={() => setKameraBuka(false)}
        />
      )}

      {/* Memotret struk adalah aksi harian di aplikasi ini, jadi tombol
          kameranya yang primer. */}
      <Button variant="primary" iconName="video-camera-on" onClick={() => setKameraBuka(true)}>
        Foto pakai kamera
      </Button>

      <FormField label="Atau pilih dari galeri" constraintText="PNG, JPG, WEBP, atau HEIC. Maksimal 5 MB per gambar.">
        {/* value selalu kosong: FileUpload di sini cuma pemilih berkas.
            Antrean dan hasilnya ditampilkan sendiri di bawah. */}
        <FileUpload
          multiple
          accept={ACCEPT}
          value={[]}
          onChange={(e) => tambahFiles(e.detail.value)}
        />
      </FormField>

      {items.length > 0 && (
        <SpaceBetween size="s">
          {items.map((i) => (
            <div key={i.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={i.preview}
                alt=""
                style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <HasilItem item={i} />
              </div>

              {!berjalan && (
                <Button variant="icon" iconName="close" ariaLabel="Hapus gambar" onClick={() => hapus(i.id)} />
              )}
            </div>
          ))}
        </SpaceBetween>
      )}

      {items.length > 0 && (
        <SpaceBetween direction="horizontal" size="xs">
          {antre > 0 && (
            <Button variant="primary" loading={berjalan} onClick={() => void prosesSemua()}>
              {berjalan ? "Lagi diproses..." : `Proses ${antre} gambar`}
            </Button>
          )}
          {selesai > 0 && (
            <Button disabled={berjalan} onClick={bersihkan}>
              Bersihkan daftar
            </Button>
          )}
        </SpaceBetween>
      )}

      {berjalan && (
        <Box variant="small" color="text-body-secondary">
          Diproses satu per satu biar nggak kena batas kuota.
        </Box>
      )}
    </SpaceBetween>
  );
}

function HasilItem({ item: i }: { item: Item }) {
  if (i.status === "antre") return <StatusIndicator type="pending">Nunggu giliran</StatusIndicator>;
  if (i.status === "proses") return <ProcessingMessage />;

  if (i.status === "ok" && i.hasil) {
    const t = i.hasil.transaction;
    return (
      <SpaceBetween size="xxxs">
        <StatusIndicator type="success">
          {t.merchant ?? "Tanpa nama"} — {fmtIDR(Number(t.amount))}
        </StatusIndicator>
        <Box variant="small" color="text-body-secondary">
          {labelKategori(t.category)} · {fmtTanggal(t.transaction_date)} · via {SUMBER[i.hasil.source]}
        </Box>
      </SpaceBetween>
    );
  }

  if (i.status === "draft") {
    return (
      <SpaceBetween size="xxxs">
        <StatusIndicator type="warning">Nggak kebaca</StatusIndicator>
        <Box variant="small" color="text-body-secondary">
          Disimpan jadi draft, nominalnya isi manual ya.
        </Box>
        {/* Jejak tahapnya cuma muncul saat gagal, dan terlipat supaya tidak
            menghalangi yang cuma mau membenarkan nominalnya. */}
        {i.hasil?.notes?.length ? (
          <ExpandableSection headerText="Kenapa gagal?" variant="footer">
            <Box variant="small">
              {i.hasil.notes.map((n, idx) => (
                <div key={idx}>· {n}</div>
              ))}
            </Box>
          </ExpandableSection>
        ) : null}
      </SpaceBetween>
    );
  }

  return (
    <SpaceBetween size="xxxs">
      <StatusIndicator type="error">Gagal</StatusIndicator>
      <Box variant="small" color="text-body-secondary">{i.pesan}</Box>
    </SpaceBetween>
  );
}
