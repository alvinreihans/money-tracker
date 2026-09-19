"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconBatal } from "@/components/icons";

/**
 * Dialog konfirmasi untuk aksi yang tidak bisa dibatalkan.
 *
 * Dipasang lewat portal ke body, bukan di tempatnya berada di pohon komponen:
 * kalau ada induk yang punya `transform` atau `overflow: hidden`, dialognya
 * bisa terpotong atau tertimbun tanpa penyebab yang kelihatan.
 */

interface Props {
  judul: string;
  keterangan: string;
  labelKonfirmasi: string;
  labelBatal?: string;
  loading?: boolean;
  error?: string | null;
  ikon?: React.ReactNode;
  onKonfirmasi: () => void;
  onBatal: () => void;
}

export default function ConfirmDialog({
  judul,
  keterangan,
  labelKonfirmasi,
  labelBatal = "Batal",
  loading = false,
  error = null,
  ikon,
  onKonfirmasi,
  onBatal,
}: Props) {
  const [terpasang, setTerpasang] = useState(false);
  const batalRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setTerpasang(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onBatal();
    }
    document.addEventListener("keydown", onKey);

    // Halaman di belakang tidak boleh ikut tergulir saat dialog terbuka.
    const awal = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Fokus jatuh ke Batal, bukan ke tombol hapus. Untuk aksi yang tidak bisa
    // dibatalkan, pilihan aman yang harus siap lebih dulu — satu ketukan Enter
    // refleks jangan sampai langsung menghapus.
    batalRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = awal;
    };
  }, [onBatal, loading]);

  if (!terpasang) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => !loading && onBatal()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-judul"
        aria-describedby="dialog-keterangan"
        // Klik di dalam kartu tidak boleh menutup dialognya.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-xl"
      >
        <h2 id="dialog-judul" className="text-base font-bold text-foreground">
          {judul}
        </h2>
        <p id="dialog-keterangan" className="mt-1 text-sm text-muted-foreground">
          {keterangan}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-[rgba(255,107,91,0.45)] bg-[rgba(255,107,91,0.14)] px-3 py-2 text-sm text-[var(--danger)]"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onKonfirmasi}
            disabled={loading}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold transition hover:opacity-90 disabled:opacity-60"
            style={{ background: "var(--danger)", color: "#151419" }}
          >
            {ikon}
            {labelKonfirmasi}
          </button>
          <button
            ref={batalRef}
            onClick={onBatal}
            disabled={loading}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-border text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
          >
            <IconBatal />
            {labelBatal}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
