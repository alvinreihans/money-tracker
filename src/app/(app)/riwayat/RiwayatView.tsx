"use client";

import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";
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

/** Filter disimpan di URL, jadi tautan dari beranda langsung jatuh di sini. */
export default function RiwayatView({ filter, daftar }: { filter: string; daftar: Transaction[] }) {
  const router = useRouter();

  return (
    <>
      <AppBar judul="Riwayat" sub={`${daftar.length} transaksi`} />

      <div className={s.isi}>
        {/* Satu baris yang bisa digeser: lima pilihan tidak muat di layar HP. */}
        <div className={s.chips} role="group" aria-label="Saring transaksi">
          {FILTER.map((f) => (
            <button
              key={f.id}
              type="button"
              className={s.chip}
              aria-pressed={filter === f.id}
              onClick={() => router.push(f.id === "semua" ? "/riwayat" : `/riwayat?filter=${f.id}`)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {daftar.length > 0 ? (
          <TransactionList items={daftar} perTanggal />
        ) : (
          <div className={s.blok}>
            <Kosong ikon={Inbox} judul={filter === "draft" ? "Nggak ada yang perlu dibenerin" : "Belum ada transaksi di sini"}>
              {filter === "draft" ? "Aman." : undefined}
            </Kosong>
          </div>
        )}
      </div>
    </>
  );
}
