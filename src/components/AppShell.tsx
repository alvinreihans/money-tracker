"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { CatatProvider } from "@/components/Catat";
import s from "@/components/ui.module.css";

/**
 * Kerangka aplikasi One UI: isi halaman, lalu navigasi bawah berupa tab teks
 * (panduan One UI: teks saja, sebaiknya kurang dari 4 tab).
 *
 * Titik merah di Riwayat menandai draft yang gagal dibaca — tanpa itu, draft
 * tersimpan diam-diam tanpa satu pun penanda.
 */
export default function AppShell({
  draftCount,
  children,
}: {
  draftCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Detail transaksi dibuka dari daftar, jadi menyorot Riwayat.
  const diRiwayat = pathname.startsWith("/riwayat") || pathname.startsWith("/transactions");

  // FAB hanya di halaman daftar; di detail ia cuma menutupi isi.
  const fab = pathname === "/" || pathname === "/riwayat";

  return (
    <CatatProvider fab={fab}>
      <div className={s.app}>{children}</div>

      <nav className={s.nav} aria-label="Navigasi utama">
        <NextLink href="/" aria-current={!diRiwayat ? "page" : undefined}>
          Beranda
        </NextLink>
        <NextLink href="/riwayat" aria-current={diRiwayat ? "page" : undefined}>
          Riwayat
          {draftCount > 0 && <span className={s.navTitik} aria-label={`${draftCount} perlu dibenerin`} role="img" />}
        </NextLink>
      </nav>
    </CatatProvider>
  );
}
