"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Search, SearchX, X } from "lucide-react";
import { AppBar, Kosong, Spinner } from "@/components/oneui";
import TransactionList from "@/components/TransactionList";
import s from "@/components/ui.module.css";
import { PER_MUAT, queryRiwayat } from "@/lib/riwayat";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types/transaction";

const FILTER = [
  { id: "semua", label: "Semua" },
  { id: "keluar", label: "Keluar" },
  { id: "masuk", label: "Masuk" },
  { id: "pindah", label: "Pindah kantong" },
];

/** Filter dan teks cari disimpan di URL, jadi tautan dari beranda langsung jatuh di sini. */
function alamat(filter: string, q: string) {
  const p = new URLSearchParams();
  if (filter !== "semua") p.set("filter", filter);
  if (q) p.set("q", q);
  const qs = p.toString();
  return qs ? `/riwayat?${qs}` : "/riwayat";
}

export default function RiwayatView({
  filter,
  q,
  total,
  daftar,
}: {
  filter: string;
  q: string;
  /** Jumlah transaksi sebenarnya untuk filter & pencarian ini. */
  total: number;
  /** 100 pertama dari server. */
  daftar: Transaction[];
}) {
  const router = useRouter();
  // "Muat lagi" mengambil 100 berikutnya langsung dari browser dan
  // menyambungnya di bawah — tanpa pindah halaman, jadi posisi gulir tetap.
  const [lanjutan, setLanjutan] = useState<{ asal: Transaction[]; isi: Transaction[] }>({ asal: daftar, isi: [] });
  const [memuat, setMemuat] = useState(false);
  const [gagalMuat, setGagalMuat] = useState(false);
  // Data server baru (filter/cari ganti, atau refresh setelah simpan):
  // sambungan lama dibuang.
  const tambahan = lanjutan.asal === daftar ? lanjutan.isi : [];
  const semua = tambahan.length ? [...daftar, ...tambahan] : daftar;

  async function muatLagi() {
    setMemuat(true);
    setGagalMuat(false);
    const { data, error } = await queryRiwayat(createSupabaseBrowserClient(), filter, q).range(
      semua.length,
      semua.length + PER_MUAT - 1,
    );
    setMemuat(false);
    if (error) return setGagalMuat(true);
    setLanjutan({ asal: daftar, isi: [...tambahan, ...((data ?? []) as Transaction[])] });
  }
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
        sub={q ? `${total} hasil untuk “${q}”` : `${total} transaksi`}
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
          <TransactionList
            items={semua}
            kembali={alamat(filter, q)}
            kaki={
              semua.length < total && (
                <button
                  type="button"
                  className={`${s.kartuTx} ${s.kartuKaki} ${s.tekan}`}
                  style={{ width: "100%", border: 0, cursor: "pointer" }}
                  disabled={memuat}
                  onClick={() => void muatLagi()}
                >
                  {memuat ? (
                    <Spinner label="Memuat…" />
                  ) : gagalMuat ? (
                    "Gagal memuat. Ketuk untuk coba lagi"
                  ) : (
                    `Muat lagi · ${total - semua.length} transaksi lebih lama`
                  )}
                </button>
              )
            }
          />
        ) : (
          <div className={s.blok}>
            {q ? (
              <Kosong ikon={SearchX} judul={`Nggak ketemu “${q}”`}>
                Coba kata lain, atau cek filter yang aktif.
              </Kosong>
            ) : (
              <Kosong ikon={Inbox} judul="Belum ada transaksi di sini" />
            )}
          </div>
        )}
      </div>
    </>
  );
}
