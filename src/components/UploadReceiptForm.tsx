"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton, Stack, Text } from "@primer/react";
import {
  AlertIcon,
  CheckCircleFillIcon,
  ClockIcon,
  DeviceCameraIcon,
  ImageIcon,
  XCircleFillIcon,
  XIcon,
} from "@primer/octicons-react";
import ProcessingMessage from "@/components/ProcessingMessage";
import s from "@/components/ui.module.css";
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
    <Stack gap="normal">
      {antrean.items.map((i) => (
        <div key={i.id} className={s.antrean}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={i.preview} alt="" className={s.thumb} />
          <div className={s.barisIsi} style={{ flex: 1 }}>
            <HasilItem item={i} />
          </div>
          {i.status !== "proses" && (
            <IconButton icon={XIcon} variant="invisible" size="small" aria-label="Hapus dari daftar" onClick={() => antrean.hapus(i.id)} />
          )}
        </div>
      ))}

      {antrean.berjalan && (
        <Text size="small" className={s.redup}>
          Diproses satu per satu biar nggak kena batas kuota. Dialog ini boleh ditutup — prosesnya
          jalan terus.
        </Text>
      )}

      <Stack direction="horizontal" gap="condensed" wrap="wrap">
        <Button leadingVisual={DeviceCameraIcon} onClick={onKamera}>
          Foto lagi
        </Button>
        <Button leadingVisual={ImageIcon} onClick={onGaleri}>
          Tambah gambar
        </Button>
        {antrean.gagal > 0 && !antrean.berjalan && (
          <Button onClick={antrean.ulangiYangGagal}>Coba lagi yang gagal</Button>
        )}
      </Stack>
    </Stack>
  );
}

function HasilItem({ item: i }: { item: Item }) {
  if (i.status === "antre") {
    return (
      <Stack direction="horizontal" gap="condensed" align="center">
        <ClockIcon />
        <Text size="small">Nunggu giliran</Text>
      </Stack>
    );
  }
  if (i.status === "proses") return <ProcessingMessage />;

  if (i.status === "ok" && i.hasil) {
    const t = i.hasil.transaction;
    return (
      <>
        <Stack direction="horizontal" gap="condensed" align="center">
          <CheckCircleFillIcon fill="var(--fgColor-success)" />
          <Text weight="semibold">
            {t.merchant ?? "Tanpa nama"} — {fmtIDR(Number(t.amount))}
          </Text>
        </Stack>
        <span className={s.redup}>
          {labelKategori(t.category)} · {fmtTanggal(t.transaction_date)} · via {SUMBER[i.hasil.source]}
        </span>
      </>
    );
  }

  if (i.status === "draft") {
    return (
      <>
        <Stack direction="horizontal" gap="condensed" align="center">
          <AlertIcon fill="var(--fgColor-attention)" />
          <Text weight="semibold">Nggak kebaca</Text>
        </Stack>
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
      <Stack direction="horizontal" gap="condensed" align="center">
        <XCircleFillIcon fill="var(--fgColor-danger)" />
        <Text weight="semibold">Gagal</Text>
      </Stack>
      <span className={s.redup}>{i.pesan}</span>
    </>
  );
}
