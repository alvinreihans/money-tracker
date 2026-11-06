"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HasilLengkapi } from "@/lib/lengkapi-server";
import type { ExtractedReceipt, Transaction } from "@/types/transaction";

/**
 * Hasil satu gambar di antrean:
 *  ok = tercatat baru, draft = belum lengkap / perlu dicek, dilengkapi =
 *  melengkapi transaksi yang sudah ada (SPEC-lengkapi K1), dipakai = gambar yang
 *  sama sudah pernah dipakai, ragu = beberapa kandidat (dicoba lagi di akhir).
 */
export type StatusStruk = "antre" | "proses" | "ok" | "draft" | "gagal" | "dilengkapi" | "dipakai" | "ragu";

export interface ItemStruk {
  id: string;
  file: File;
  status: StatusStruk;
  /** Hasil baca AI, dikirim balik saat dicoba lagi (tanpa AI). */
  hasil?: ExtractedReceipt | null;
  tx?: Transaction | null;
  lengkapi?: HasilLengkapi | null;
  dipakai?: { id: string; label: string } | null;
  /** Lengkapi otomatisnya sudah diurungkan dari ringkasan. */
  diurungkan?: boolean;
}

export const ACCEPT_STRUK = "image/png,image/jpeg,image/webp,image/heic";

/** Batas gambar per unggahan (SPEC-lengkapi K3). */
export const MAKS_GAMBAR = 50;

/** Jeda minimum antar-panggilan AI (batas kuota Gemini paket gratis ±15/menit). */
const JEDA_AI_MS = 4000;

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Antrean gambar dari galeri (banyak sekaligus), seret-lepas, dan "Bagikan":
 * diproses berurutan di latar, masing-masing jadi satu transaksi baru atau
 * melengkapi transaksi yang sudah tercatat (SPEC-lengkapi §7). Dipegang di
 * tingkat aplikasi (Catat.tsx), jadi tetap jalan saat pindah halaman.
 *
 * Satu per satu, bukan barengan: kuota AI per menit. Gambar yang pasangannya
 * ragu ditunda ke akhir, lalu dikirim lagi (tanpa AI) bersama urutan jamnya di
 * antara gambar sebayar & setanggal — pasangan baris rekening tanpa jam.
 */
export function useAntreanStruk() {
  const router = useRouter();
  const [items, setItems] = useState<ItemStruk[]>([]);
  const [berjalan, setBerjalan] = useState(false);
  // Salinan sinkron dari items: pelari antrean perlu melihat item yang baru
  // ditambahkan tanpa menunggu render berikutnya.
  const itemsRef = useRef<ItemStruk[]>([]);
  const jalanRef = useRef(false);

  function perbarui(fn: (prev: ItemStruk[]) => ItemStruk[]) {
    itemsRef.current = fn(itemsRef.current);
    setItems(itemsRef.current);
  }

  const ubah = (id: string, isi: Partial<ItemStruk>) => perbarui((prev) => prev.map((i) => (i.id === id ? { ...i, ...isi } : i)));

  /** Kirim satu gambar; true bila AI dipakai (perlu jeda kuota). */
  async function prosesSatu(item: ItemStruk, ulang?: { peringkat: { ke: number; dari: number } | null }): Promise<boolean> {
    ubah(item.id, { status: "proses" });
    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("banyak", "1");
    if (ulang) {
      formData.append("hasil", JSON.stringify(item.hasil));
      if (ulang.peringkat) formData.append("peringkat", JSON.stringify(ulang.peringkat));
    } else formData.append("tunda", "1");
    try {
      const res = await fetch("/api/upload-receipt", { method: "POST", body: formData });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        source?: string;
        hasil?: ExtractedReceipt;
        transaction?: Transaction;
        dilengkapi?: HasilLengkapi;
        dipakai?: { id: string; label: string };
        ragu?: boolean;
        cicilan?: unknown;
      };
      const isi: Partial<ItemStruk> = { hasil: data.hasil ?? item.hasil ?? null };
      if (!res.ok) isi.status = "gagal";
      else if (data.dipakai) Object.assign(isi, { status: "dipakai", dipakai: data.dipakai });
      else if (data.dilengkapi) Object.assign(isi, { status: "dilengkapi", lengkapi: data.dilengkapi, tx: data.dilengkapi.transaction });
      else if (data.ragu) isi.status = "ragu";
      else Object.assign(isi, { status: data.status === "confirmed" || data.cicilan ? "ok" : "draft", tx: data.transaction ?? null });
      ubah(item.id, isi);
      return Boolean(data.source && data.source !== "hasil");
    } catch {
      ubah(item.id, { status: "gagal" });
      return false;
    }
  }

  async function jalankan() {
    if (jalanRef.current) return;
    jalanRef.current = true;
    setBerjalan(true);
    let mulaiAi = 0;
    for (;;) {
      const next = itemsRef.current.find((i) => i.status === "antre");
      if (!next) {
        // Yang pasangannya ragu: sekali lagi, dengan urutan jamnya di antara
        // gambar sebayar & setanggal (gambar ke-k = baris rekening ke-k).
        const ragu = itemsRef.current.filter((i) => i.status === "ragu" && i.hasil);
        if (!ragu.length) break;
        for (const r of ragu) {
          const sama = ragu
            .filter((x) => x.hasil!.transaction_date === r.hasil!.transaction_date && x.hasil!.amount === r.hasil!.amount)
            .sort((a, b) => (a.hasil!.time ?? "").localeCompare(b.hasil!.time ?? ""));
          const bisa = sama.length > 1 && sama.every((x) => x.hasil!.time) && new Set(sama.map((x) => x.hasil!.time)).size === sama.length;
          await prosesSatu(r, { peringkat: bisa ? { ke: sama.indexOf(r) + 1, dari: sama.length } : null });
          if (itemsRef.current.find((i) => i.id === r.id)?.status === "ragu") ubah(r.id, { status: "gagal" });
        }
        // Yang masih ragu sesudah dicoba lagi sudah jadi draft "sudah tercatat?" di server.
        continue;
      }
      const tunggu = mulaiAi + JEDA_AI_MS - Date.now();
      if (mulaiAi && tunggu > 0) await tidur(tunggu);
      const awal = Date.now();
      if (await prosesSatu(next)) mulaiAi = awal;
    }
    jalanRef.current = false;
    setBerjalan(false);
    router.refresh(); // segarkan ringkasan, daftar, dan penanda "belum selesai"
  }

  /** Tambah gambar; mengembalikan jumlah yang tidak masuk karena batas K3. */
  function tambah(files: File[]): number {
    if (!files.length) return 0;
    const muat = Math.max(0, MAKS_GAMBAR - itemsRef.current.filter((i) => i.status === "antre" || i.status === "proses").length);
    const masuk = files.slice(0, muat);
    perbarui((prev) => [
      ...prev,
      ...masuk.map((file) => ({ id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`, file, status: "antre" as StatusStruk })),
    ]);
    if (masuk.length) void jalankan();
    return files.length - masuk.length;
  }

  return {
    items,
    berjalan,
    tambah,
    bersihkan: () => perbarui(() => []),
    sisa: items.filter((i) => i.status === "antre" || i.status === "proses" || i.status === "ragu").length,
  };
}
