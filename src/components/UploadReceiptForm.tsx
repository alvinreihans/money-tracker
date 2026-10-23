"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "antre" | "proses" | "ok" | "draft" | "gagal";

interface Item {
  id: string;
  file: File;
  status: Status;
}

export const ACCEPT_STRUK = "image/png,image/jpeg,image/webp,image/heic";

/**
 * Antrean struk dari "Bagikan" (bisa beberapa gambar sekaligus): masing-masing
 * diproses sendiri jadi satu transaksi — yang lengkap tercatat, yang kurang
 * menjadi catatan "Belum selesai". Dipegang di tingkat aplikasi (Catat.tsx),
 * jadi tetap jalan saat pindah halaman.
 *
 * Satu per satu, bukan barengan: OCR berat di CPU dan Groq punya batas token
 * per menit, jadi dikirim serentak justru bikin sebagian kena rate limit.
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

  const ubah = (id: string, status: Status) => perbarui((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));

  async function prosesSatu(item: Item) {
    ubah(item.id, "proses");
    const formData = new FormData();
    formData.append("file", item.file);
    try {
      const res = await fetch("/api/upload-receipt", { method: "POST", body: formData });
      const data = (await res.json().catch(() => ({}))) as { status?: string };
      ubah(item.id, !res.ok ? "gagal" : data.status === "confirmed" ? "ok" : "draft");
    } catch {
      ubah(item.id, "gagal");
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
    router.refresh(); // segarkan ringkasan, daftar, dan penanda "belum selesai"
  }

  function tambah(files: File[]) {
    if (!files.length) return;
    perbarui((prev) => [
      ...prev,
      ...files.map((file) => ({ id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`, file, status: "antre" as Status })),
    ]);
    void jalankan();
  }

  return {
    items,
    berjalan,
    tambah,
    bersihkan: () => perbarui(() => []),
    sisa: items.filter((i) => i.status === "antre" || i.status === "proses").length,
  };
}
