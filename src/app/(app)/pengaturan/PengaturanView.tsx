"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Download, HandCoins, LogOut, Shapes, Target, UserRound, Wallet } from "lucide-react";
import { useCatat, useKategori } from "@/components/Catat";
import { AppBar } from "@/components/oneui";
import SakelarNotifikasi from "@/components/SakelarNotifikasi";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Satu baris pengaturan yang membuka halaman lain, ala Pengaturan Samsung. */
export function BarisMenu({
  href,
  ikon: Ikon,
  warna,
  judul,
  ket,
}: {
  href: string;
  ikon: React.ElementType;
  warna: string;
  judul: string;
  ket: string;
}) {
  return (
    <NextLink href={href} className={`${s.baris} ${s.tekan}`}>
      <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
        <Ikon size={20} />
      </span>
      <span className={s.barisTeks}>
        <span className={s.barisJudul}>{judul}</span>
        <span className={s.redup}>{ket}</span>
      </span>
      <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
    </NextLink>
  );
}

/**
 * Pengaturan, dibuka dari menu ⋮ di Beranda. Tidak jadi tab: jarang dibuka,
 * dan navigasi bawah disimpan untuk yang dipakai tiap hari.
 */
export default function PengaturanView({
  email,
  jumlahKantong,
  jumlahBudget,
}: {
  email: string | null;
  jumlahKantong: number;
  jumlahBudget: number;
}) {
  const router = useRouter();
  const { kabari } = useCatat();
  const [mengekspor, setMengekspor] = useState(false);

  /**
   * Ekspor CSV: diunduh lewat fetch supaya ada umpan balik — baris berputar
   * selama file disiapkan, lalu snackbar dengan aksi Bagikan (lembar berbagi
   * Android: Drive, WhatsApp, …) kalau browser mendukung berbagi file.
   */
  async function ekspor() {
    if (mengekspor) return;
    setMengekspor(true);
    const res = await fetch("/api/ekspor").catch(() => null);
    if (!res?.ok) {
      setMengekspor(false);
      return kabari("Gagal mengekspor. Coba lagi ya.");
    }
    const jumlah = Number(res.headers.get("x-jumlah") ?? 0);
    const nama = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "money-tracker.csv";
    const berkas = new File([await res.blob()], nama, { type: "text/csv" });
    setMengekspor(false);
    if (!jumlah) return kabari("Belum ada transaksi untuk diekspor.");

    const url = URL.createObjectURL(berkas);
    const a = Object.assign(document.createElement("a"), { href: url, download: nama });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    const bisaBagikan = typeof navigator.canShare === "function" && navigator.canShare({ files: [berkas] });
    kabari(
      `${jumlah} transaksi diekspor ke Unduhan`,
      bisaBagikan ? { label: "Bagikan", jalankan: () => void navigator.share({ files: [berkas], title: nama }).catch(() => {}) } : undefined,
    );
  }
  const kategori = useKategori();

  async function keluar() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <AppBar judul="Pengaturan" kembali="/" />

      <div className={s.isi}>
        <h2 className={s.subheader}>Keuangan</h2>
        <div className={s.blok}>
          <BarisMenu
            href="/pengaturan/kantong"
            ikon={Wallet}
            warna="#bf7af0"
            judul="Kantong"
            ket={jumlahKantong > 0 ? `${jumlahKantong} kantong` : "Rekening, e-wallet, tunai"}
          />
          <BarisMenu
            href="/pengaturan/kategori"
            ikon={Shapes}
            warna="#ff9f43"
            judul="Kategori"
            ket={`${kategori.filter((k) => k.type === "expense").length} pengeluaran · ${kategori.filter((k) => k.type === "income").length} pemasukan`}
          />
          <BarisMenu
            href="/pinjaman"
            ikon={HandCoins}
            warna="#5ecb7a"
            judul="Lend & Borrow"
            ket="Pinjaman, kartu kredit, cicilan"
          />
          <BarisMenu
            href="/pengaturan/budget"
            ikon={Target}
            warna="#3e91ff"
            judul="Budget"
            ket={jumlahBudget > 0 ? `${jumlahBudget} kategori dibatasi` : "Batas pengeluaran per kategori"}
          />
        </div>

        <h2 className={s.subheader}>Notifikasi</h2>
        <div className={s.blok}>
          <SakelarNotifikasi />
        </div>

        <h2 className={s.subheader}>Akun</h2>
        <div className={s.blok}>
          {email && (
            <div className={s.baris}>
              <span className={s.barisIkon} aria-hidden>
                <UserRound size={20} />
              </span>
              <span className={s.barisTeks}>
                <span className={s.barisJudul}>{email}</span>
                <span className={s.redup}>Email masuk</span>
              </span>
            </div>
          )}
          <button type="button" className={`${s.baris} ${s.tekan}`} onClick={() => void ekspor()} disabled={mengekspor} aria-busy={mengekspor}>
            <span className={s.barisIkon} aria-hidden>
              {mengekspor ? <span className={s.spinner} /> : <Download size={20} />}
            </span>
            <span className={s.barisTeks}>
              <span className={s.barisJudul}>Ekspor data</span>
              <span className={s.redup}>{mengekspor ? "Menyiapkan file…" : "Semua transaksi sebagai file CSV"}</span>
            </span>
          </button>
          <button type="button" className={`${s.baris} ${s.tekan}`} onClick={() => void keluar()}>
            <span className={`${s.barisIkon} ${s.bahaya}`} aria-hidden>
              <LogOut size={20} />
            </span>
            <span className={`${s.barisJudul} ${s.bahaya}`}>Keluar</span>
          </button>
        </div>

        <p className={s.versi}>Money Tracker {process.env.NEXT_PUBLIC_VERSI}</p>
      </div>
    </>
  );
}
