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
}

type Status = "antre" | "proses" | "ok" | "draft" | "gagal";

interface Item {
  id: string;
  file: File;
  preview: string;
  status: Status;
  hasil?: UploadResponse;
  pesan?: string;
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

      <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6">
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">
            Upload Struk
          </h3>
          <p className="text-sm text-slate-500">
            Bisa sekalian banyak. Nanti dibaca otomatis terus disimpan.
          </p>
        </div>

        <div className="space-y-4 p-6 pt-0">
          <div className="flex flex-wrap gap-2">
            {/* Begitu antreannya habis, menambah gambar jadi aksi utama —
                jadi tombol ini yang ditonjolkan, bukan tombol proses. */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={
                semuaSelesai
                  ? "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  : "rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              }
            >
              {semuaSelesai ? "Upload lagi" : "Pilih gambar"}
            </button>
            <button
              type="button"
              onClick={() => setKameraBuka(true)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Foto pakai kamera
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
                  className="flex items-start gap-3 rounded-lg border border-slate-200 p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={i.preview}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded object-cover"
                  />

                  <div className="min-w-0 flex-1 text-sm">
                    {i.status === "antre" && <p className="text-slate-400">Nunggu giliran</p>}
                    {i.status === "proses" && (
                      <ProcessingMessage className="text-slate-600" />
                    )}

                    {i.status === "ok" && i.hasil && (
                      <>
                        <p className="font-medium text-emerald-700">
                          {i.hasil.transaction.merchant ?? "Tanpa nama"} —{" "}
                          {fmtIDR(i.hasil.transaction.amount)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {i.hasil.transaction.category} ·{" "}
                          {i.hasil.transaction.transaction_date}
                        </p>
                      </>
                    )}

                    {i.status === "draft" && (
                      <>
                        <p className="font-medium text-amber-700">Nggak kebaca</p>
                        <p className="text-xs text-slate-500">
                          Disimpan jadi draft, nominalnya isi manual ya.
                        </p>
                      </>
                    )}

                    {i.status === "gagal" && (
                      <>
                        <p className="font-medium text-red-600">Gagal</p>
                        <p className="text-xs text-slate-500">{i.pesan}</p>
                      </>
                    )}
                  </div>

                  {!berjalan && (
                    <button
                      onClick={() => hapus(i.id)}
                      className="shrink-0 text-xs text-slate-400 transition hover:text-red-600"
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
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {berjalan ? "Lagi diproses..." : `Proses ${antre} gambar`}
                </button>
              )}

              {selesai > 0 && (
                <button
                  type="button"
                  onClick={bersihkan}
                  disabled={berjalan}
                  className="text-sm text-slate-500 transition hover:text-slate-900 disabled:opacity-40"
                >
                  Bersihkan daftar
                </button>
              )}
            </div>
          )}

          {berjalan && (
            <p className="text-xs text-slate-400">
              Diproses satu per satu biar nggak kena batas kuota.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
