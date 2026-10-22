"use client";

import { useEffect } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { House, ReceiptText } from "lucide-react";
import { CatatProvider, TombolCatat, type PilihanKantong } from "@/components/Catat";
import { KembaliKeAtas } from "@/components/oneui";
import type { Kategori } from "@/lib/kategori";
import s from "@/components/ui.module.css";

/**
 * Kerangka aplikasi One UI: isi halaman, lalu navigasi bawah berupa kapsul
 * melayang ala Samsung Wallet (ikon di atas label, kurang dari 4 tab), dengan
 * tombol + di tengahnya.
 *
 * Titik oranye di Riwayat menandai draft yang gagal dibaca — tanpa itu, draft
 * tersimpan diam-diam tanpa satu pun penanda.
 */
export default function AppShell({
  draftCount,
  saran,
  kantong,
  kategori,
  email,
  children,
}: {
  draftCount: number;
  email: string | null;
  kantong: PilihanKantong[];
  kategori: Kategori[];
  /** Teks transaksi terakhir untuk chip saran di kolom "Catat". */
  saran: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Service worker untuk menerima "Bagikan" (public/sw.js). Sekali daftar
  // cukup; browser yang tidak mendukung dilewati.
  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
  }, []);

  // Detail transaksi dibuka dari daftar, jadi menyorot Riwayat.
  const diRiwayat = pathname.startsWith("/riwayat") || pathname.startsWith("/transactions");

  return (
    <CatatProvider saran={saran} kantong={kantong} kategori={kategori} email={email}>
      <div className={s.app}>{children}</div>
      <KembaliKeAtas />

      <nav className={s.nav} aria-label="Navigasi utama">
        <NextLink href="/" aria-current={!diRiwayat ? "page" : undefined}>
          {/* Ikon tab aktif digaris lebih tebal, mengikuti ikon terisi di Samsung Wallet. */}
          <House size={22} strokeWidth={!diRiwayat ? 2.4 : 1.7} aria-hidden />
          Beranda
        </NextLink>
        {/* Mencatat adalah aksi utama aplikasi, jadi tombolnya di tengah —
            terjangkau jempol kiri maupun kanan, dan tidak menutupi nominal
            yang rata kanan di daftar. */}
        <TombolCatat />
        <NextLink href="/riwayat" aria-current={diRiwayat ? "page" : undefined}>
          <span className={s.navIkon}>
            <ReceiptText size={22} strokeWidth={diRiwayat ? 2.4 : 1.7} aria-hidden />
            {draftCount > 0 && <span className={s.navTitik} aria-label={`${draftCount} perlu dibenerin`} role="img" />}
          </span>
          Riwayat
        </NextLink>
      </nav>
    </CatatProvider>
  );
}
