"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import CameraCapture from "@/components/CameraCapture";
import ProcessingMessage from "@/components/ProcessingMessage";
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

const ikon = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconKamera() {
  return (
    <svg {...ikon}>
      <path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.2-2h7.6L17 6.5h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function IconGaleri() {
  return (
    <svg {...ikon} width={22} height={22}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m4 17 4.5-4.5 3 3L15 12l5 5" />
    </svg>
  );
}

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);

export default function UploadReceiptForm() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [berjalan, setBerjalan] = useState(false);
  const [kameraBuka, setKameraBuka] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  function handlePilih(e: ChangeEvent<HTMLInputElement>) {
    tambahFiles(Array.from(e.target.files ?? []));
    // Reset supaya memilih file yang sama dua kali tetap memicu onChange.
    if (fileRef.current) fileRef.current.value = "";
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
      ubah(item.id, {
        status: hasil.status === "confirmed" ? "ok" : "draft",
        hasil,
      });
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
    router.refresh(); // segarkan chart dengan data terbaru
  }

  const antre = items.filter((i) => i.status === "antre" || i.status === "gagal").length;
  const selesai = items.filter((i) => i.status === "ok" || i.status === "draft").length;
  const semuaSelesai = items.length > 0 && antre === 0 && !berjalan;

  return (
    <>
      {kameraBuka && (
        <CameraCapture
          onCapture={(file) => {
            tambahFiles([file]);
            setKameraBuka(false);
          }}
          onClose={() => setKameraBuka(false)}
        />
      )}

      <div className="w-full rounded-[var(--radius-lg)] border border-border bg-card shadow-sm">
        <div className="p-4 pb-3">
          <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Catat transaksi
          </p>
        </div>

        <div className="space-y-4 p-4 pt-0">
          {/* Memotret struk adalah aksi harian di aplikasi ini, jadi kedua
              tombolnya dibikin besar dan sejajar — bukan tombol teks kecil. */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setKameraBuka(true)}
              className="flex flex-col items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 py-3.5 text-sm font-bold text-primary-foreground transition hover:opacity-90"
            >
              <IconKamera />
              Foto pakai kamera
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-[var(--radius)] border-[1.5px] border-dashed border-border bg-secondary px-3 py-3.5 text-sm font-semibold text-secondary-foreground transition hover:opacity-90"
            >
              <IconGaleri />
              {semuaSelesai ? "Upload lagi" : "Pilih gambar"}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/heic"
              onChange={handlePilih}
              className="hidden"
            />
          </div>

          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((i) => (
                <li
                  key={i.id}
                  className="flex items-start gap-3 rounded-[var(--radius)] border border-border p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={i.preview}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded object-cover"
                  />

                  <div className="min-w-0 flex-1 text-sm">
                    {i.status === "antre" && <p className="text-muted-foreground">Nunggu giliran</p>}
                    {i.status === "proses" && (
                      <ProcessingMessage className="text-muted-foreground" />
                    )}

                    {i.status === "ok" && i.hasil && (
                      <>
                        <p className="font-medium text-[var(--success)]">
                          {i.hasil.transaction.merchant ?? "Tanpa nama"} —{" "}
                          {fmtIDR(i.hasil.transaction.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {i.hasil.transaction.category} ·{" "}
                          {i.hasil.transaction.transaction_date} · via{" "}
                          {SUMBER[i.hasil.source]}
                        </p>
                      </>
                    )}

                    {i.status === "draft" && (
                      <>
                        <p className="font-medium text-[var(--accent)]">Nggak kebaca</p>
                        <p className="text-xs text-muted-foreground">
                          Disimpan jadi draft, nominalnya isi manual ya.
                        </p>
                        {/* Jejak tahapnya cuma muncul saat gagal, dan terlipat
                            supaya tidak menghalangi yang cuma mau membenarkan
                            nominalnya. */}
                        {i.hasil?.notes?.length ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-muted-foreground">
                              Kenapa gagal?
                            </summary>
                            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {i.hasil.notes.map((n, idx) => (
                                <li key={idx} className="break-words">
                                  · {n}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </>
                    )}

                    {i.status === "gagal" && (
                      <>
                        <p className="font-medium text-[var(--danger)]">Gagal</p>
                        <p className="text-xs text-muted-foreground">{i.pesan}</p>
                      </>
                    )}
                  </div>

                  {!berjalan && (
                    <button
                      onClick={() => hapus(i.id)}
                      className="shrink-0 text-xs text-muted-foreground transition hover:text-[var(--danger)]"
                    >
                      Hapus
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {antre > 0 && (
                <button
                  type="button"
                  onClick={() => void prosesSemua()}
                  disabled={berjalan}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                >
                  {berjalan ? "Lagi diproses..." : `Proses ${antre} gambar`}
                </button>
              )}

              {selesai > 0 && (
                <button
                  type="button"
                  onClick={bersihkan}
                  disabled={berjalan}
                  className="text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                >
                  Bersihkan daftar
                </button>
              )}
            </div>
          )}

          {berjalan && (
            <p className="text-xs text-muted-foreground">
              Diproses satu per satu biar nggak kena batas kuota.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
