"use client";

import { useEffect } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { CatatProvider, TombolCatat, type PilihanKantong } from "@/components/Catat";
import { NAVIGASI } from "@/components/navigasi";
import { KembaliKeAtas } from "@/components/oneui";
import type { Kategori } from "@/lib/kategori";
import s from "@/components/ui.module.css";

/**
 * Kerangka aplikasi One UI: isi halaman, lalu navigasi bawah berupa kapsul
 * melayang ala Samsung Wallet (ikon di atas label): Beranda · Riwayat · + ·
 * Analitik · Profil (SPEC-navigasi). Mulai 600px kapsul yang sama jadi rail
 * di kiri, mulai 1200px sidebar — cukup lewat CSS (SPEC-layar-lebar).
 *
 * Titik oranye di tombol + menandai catatan yang belum selesai (SPEC-catat-chat)
 * — tanpa itu, catatan itu menunggu diam-diam tanpa satu pun penanda.
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

  const tab = (t: (typeof NAVIGASI)[number]) => {
    const aktif = t.aktif(pathname);
    const Ikon = t.ikon;
    return (
      <NextLink key={t.href} href={t.href} aria-current={aktif ? "page" : undefined} data-sidebar={"sidebar" in t || undefined}>
        {t.href === "/profil" && email ? (
          // Profil: huruf awal email dalam lingkaran, seperti akun Samsung.
          <span className={s.avatarNav} data-aktif={aktif} aria-hidden>
            {email.charAt(0).toUpperCase()}
          </span>
        ) : (
          // Ikon tab aktif digaris lebih tebal, mengikuti ikon terisi di Samsung Wallet.
          <Ikon size={22} strokeWidth={aktif ? 2.4 : 1.7} aria-hidden />
        )}
        {t.label}
      </NextLink>
    );
  };

  return (
    <CatatProvider saran={saran} kantong={kantong} kategori={kategori} email={email} jumlahDraft={draftCount}>
      <div className={s.app}>{children}</div>
      <KembaliKeAtas />

      <nav className={s.nav} aria-label="Navigasi utama">
        {NAVIGASI.slice(0, 2).map(tab)}
        {/* Mencatat adalah aksi utama aplikasi, jadi tombolnya di tengah —
            terjangkau jempol kiri maupun kanan, dan tidak menutupi nominal
            yang rata kanan di daftar. */}
        <TombolCatat />
        {NAVIGASI.slice(2).map(tab)}
      </nav>
    </CatatProvider>
  );
}
