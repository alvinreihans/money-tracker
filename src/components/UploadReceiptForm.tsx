"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleCheck, CircleX, Clock, Image as IkonGambar, RotateCcw, TriangleAlert, X } from "lucide-react";
import ProcessingMessage from "@/components/ProcessingMessage";
import s from "@/components/ui.module.css";
import { useKategori } from "@/components/Catat";
import { fmtIDR, fmtTanggal } from "@/lib/format";
import { namaKategori } from "@/lib/kategori";
import { alasanDraft } from "@/lib/kantong";
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

export const ACCEPT_STRUK = "image/png,image/jpeg,image/webp,image/heic";

export type AntreanStruk = ReturnType<typeof useAntreanStruk>;

/**
 * Antrean struk. Dipegang di tingkat aplikasi (lihat Catat.tsx), bukan di
 * dalam dialog: OCR bisa puluhan detik, dan menutup dialog tidak boleh
 * membuang antrean yang sedang jalan.
 *
 * Struk langsung diproses begitu masuk, satu per satu — bukan barengan:
 * OCR berat di CPU dan Groq punya batas token per menit, jadi dikirim
 * serentak justru bikin sebagian kena rate limit.
 */
export function useAntreanStruk() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [berjalan, setBerjalan] = useState(false);
  // Salinan sinkron dari items: pelari antrean perlu melihat item yang baru
  // ditambahkan tanpa menunggu render berikutnya.
  const itemsRef = useRef<Item[]>([]);
  const jalanRef = useRef(false);

  function perbarui(fn: (prev: Item[]) => Item[]) {
    itemsRef.current = fn(itemsRef.current);
    setItems(itemsRef.current);
  }

  // Object URL tidak dibebaskan otomatis; tanpa ini memori terus menumpuk.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  function ubah(id: string, patch: Partial<Item>) {
    perbarui((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
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

  async function jalankan() {
    if (jalanRef.current) return;
    jalanRef.current = true;
    setBerjalan(true);
    for (let next = itemsRef.current.find((i) => i.status === "antre"); next; next = itemsRef.current.find((i) => i.status === "antre")) {
      await prosesSatu(next);
    }
    jalanRef.current = false;
    setBerjalan(false);
    router.refresh(); // segarkan ringkasan, daftar, dan komposisi kategori
  }

  function tambah(files: File[]) {
    if (!files.length) return;
    perbarui((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        status: "antre" as Status,
      })),
    ]);
    void jalankan();
  }

  function ulangiYangGagal() {
    perbarui((prev) => prev.map((i) => (i.status === "gagal" ? { ...i, status: "antre" } : i)));
    void jalankan();
  }

  function hapus(id: string) {
    perbarui((prev) => {
      prev.filter((i) => i.id === id).forEach((i) => URL.revokeObjectURL(i.preview));
      return prev.filter((i) => i.id !== id);
    });
  }

  function bersihkan() {
    perbarui((prev) => {
      prev.forEach((i) => URL.revokeObjectURL(i.preview));
      return [];
    });
  }

  const hitung = (st: Status[]) => items.filter((i) => st.includes(i.status)).length;

  return {
    items,
    berjalan,
    tambah,
    ulangiYangGagal,
    hapus,
    bersihkan,
    sisa: hitung(["antre", "proses"]),
    gagal: hitung(["gagal"]),
    selesai: hitung(["ok", "draft"]),
  };
}

/** Isi dialog struk: daftar antrean dan hasilnya. */
export default function DaftarAntrean({
  antrean,
  onKamera,
  onGaleri,
}: {
  antrean: AntreanStruk;
  onKamera: () => void;
  onGaleri: () => void;
}) {
  return (
    <>
      <div className={s.blok} style={{ background: "var(--blok-2)" }}>
        {antrean.items.map((i) => (
          <div key={i.id} className={s.baris}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.preview} alt="" className={s.thumb} />
            <span className={s.barisTeks}>
              <HasilItem item={i} />
            </span>
            {i.status !== "proses" && (
              <button type="button" className={s.ikonTombol} aria-label="Hapus dari daftar" onClick={() => antrean.hapus(i.id)}>
                <X size={20} />
              </button>
            )}
          </div>
        ))}
      </div>

      {antrean.berjalan && (
        <p className={s.redup} style={{ margin: "12px 4px 0" }}>
          Diproses satu per satu biar nggak kena batas kuota. Boleh ditutup — prosesnya jalan terus.
        </p>
      )}

      <div className={s.chipsBungkus} style={{ marginTop: 16 }}>
        <button type="button" className={s.chip} onClick={onKamera}>
          <Camera size={18} /> Foto lagi
        </button>
        <button type="button" className={s.chip} onClick={onGaleri}>
          <IkonGambar size={18} /> Tambah gambar
        </button>
        {antrean.gagal > 0 && !antrean.berjalan && (
          <button type="button" className={s.chip} onClick={antrean.ulangiYangGagal}>
            <RotateCcw size={18} /> Coba lagi yang gagal
          </button>
        )}
      </div>
    </>
  );
}

function Status({ ikon: Ikon, warna, children }: { ikon: React.ElementType; warna: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Ikon size={16} color={warna} style={{ flexShrink: 0 }} />
      <span className={s.barisJudul} style={{ fontSize: 16 }}>{children}</span>
    </span>
  );
}

function HasilItem({ item: i }: { item: Item }) {
  const kategori = useKategori();
  if (i.status === "antre") return <Status ikon={Clock} warna="var(--teks-2)">Nunggu giliran</Status>;
  if (i.status === "proses") return <ProcessingMessage />;

  if (i.status === "ok" && i.hasil) {
    const t = i.hasil.transaction;
    return (
      <>
        <Status ikon={CircleCheck} warna="var(--sukses)">
          {t.merchant ?? "Tanpa nama"} — {fmtIDR(Number(t.amount))}
        </Status>
        <span className={s.redup}>
          {namaKategori(kategori, t.category, t.type)} · {fmtTanggal(t.transaction_date)} · via {SUMBER[i.hasil.source]}
        </span>
      </>
    );
  }

  if (i.status === "draft" && i.hasil && alasanDraft(i.hasil.transaction) === "kantong") {
    return (
      <>
        <Status ikon={TriangleAlert} warna="var(--peringatan)">Kantongnya belum jelas</Status>
        <span className={s.redup}>
          {fmtIDR(Number(i.hasil.transaction.amount))} disimpan jadi draft. Pilih kantongnya ya.
        </span>
      </>
    );
  }

  if (i.status === "draft") {
    return (
      <>
        <Status ikon={TriangleAlert} warna="var(--peringatan)">Nggak kebaca</Status>
        <span className={s.redup}>Disimpan jadi draft, nominalnya isi manual ya.</span>
        {/* Jejak tahapnya cuma muncul saat gagal, dan terlipat supaya tidak
            menghalangi yang cuma mau membenarkan nominalnya. */}
        {i.hasil?.notes?.length ? (
          <details className={s.redup}>
            <summary>Kenapa gagal?</summary>
            {i.hasil.notes.map((n, idx) => (
              <div key={idx}>· {n}</div>
            ))}
          </details>
        ) : null}
      </>
    );
  }

  return (
    <>
      <Status ikon={CircleX} warna="var(--bahaya)">Gagal</Status>
      <span className={s.redup}>{i.pesan}</span>
    </>
  );
}
