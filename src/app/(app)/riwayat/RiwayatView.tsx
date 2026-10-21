"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Search, SearchX, X } from "lucide-react";
import { AppBar, Kosong } from "@/components/oneui";
import TransactionList from "@/components/TransactionList";
import s from "@/components/ui.module.css";
import type { Transaction } from "@/types/transaction";

const FILTER = [
  { id: "semua", label: "Semua" },
  { id: "keluar", label: "Keluar" },
  { id: "masuk", label: "Masuk" },
  { id: "pindah", label: "Pindah kantong" },
  { id: "draft", label: "Perlu dibenerin" },
];

/** Filter dan teks cari disimpan di URL, jadi tautan dari beranda langsung jatuh di sini. */
function alamat(filter: string, q: string) {
  const p = new URLSearchParams();
  if (filter !== "semua") p.set("filter", filter);
  if (q) p.set("q", q);
  const qs = p.toString();
  return qs ? `/riwayat?${qs}` : "/riwayat";
}

export default function RiwayatView({ filter, q, daftar }: { filter: string; q: string; daftar: Transaction[] }) {
  const router = useRouter();
  const [cariBuka, setCariBuka] = useState(Boolean(q));
  const [teks, setTeks] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fokus masih di dalam ketukan tombol cari, jadi keyboard HP langsung muncul.
  useLayoutEffect(() => {
    if (cariBuka) inputRef.current?.focus();
  }, [cariBuka]);

  // Cari otomatis sejenak setelah berhenti mengetik, tanpa tombol "Cari".
  useEffect(() => {
    if (teks.trim() === q) return;
    const t = setTimeout(() => router.replace(alamat(filter, teks.trim())), 300);
    return () => clearTimeout(t);
  }, [teks, q, filter, router]);

  function tutupCari() {
    setTeks("");
    setCariBuka(false);
    if (q) router.replace(alamat(filter, ""));
  }

  return (
    <>
      <AppBar
        judul="Riwayat"
        sub={q ? `${daftar.length} hasil untuk “${q}”` : `${daftar.length} transaksi`}
        aksi={
          !cariBuka && (
            <button type="button" className={s.ikonTombol} aria-label="Cari transaksi" onClick={() => setCariBuka(true)}>
              <Search size={22} />
            </button>
          )
        }
      />

      <div className={s.isi}>
        {cariBuka && (
          <div className={s.cari} role="search">
            <Search size={20} aria-hidden />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              aria-label="Cari merchant, keterangan, atau metode bayar"
              placeholder="Cari merchant, keterangan…"
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && tutupCari()}
            />
            <button type="button" className={s.ikonTombol} aria-label="Tutup pencarian" onClick={tutupCari}>
              <X size={20} />
            </button>
          </div>
        )}

        {/* Satu baris yang bisa digeser: lima pilihan tidak muat di layar HP. */}
        <div className={s.chips} role="group" aria-label="Saring transaksi">
          {FILTER.map((f) => (
            <button
              key={f.id}
              type="button"
              className={s.chip}
              aria-pressed={filter === f.id}
              onClick={() => router.push(alamat(f.id, q))}
            >
              {f.label}
            </button>
          ))}
        </div>

        {daftar.length > 0 ? (
          <TransactionList items={daftar} />
        ) : (
          <div className={s.blok}>
            {q ? (
              <Kosong ikon={SearchX} judul={`Nggak ketemu “${q}”`}>
                Coba kata lain, atau cek filter yang aktif.
              </Kosong>
            ) : (
              <Kosong ikon={Inbox} judul={filter === "draft" ? "Nggak ada yang perlu dibenerin" : "Belum ada transaksi di sini"}>
                {filter === "draft" ? "Aman." : undefined}
              </Kosong>
            )}
          </div>
        )}
      </div>
    </>
  );
}
