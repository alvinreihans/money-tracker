"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AppLayout from "@cloudscape-design/components/app-layout";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useIkuti, useTerpasang } from "@/components/ui";

/**
 * Kerangka aplikasi: bilah atas (identitas + menu akun), navigasi samping,
 * dan area konten. Di layar HP navigasi samping otomatis jadi menu hamburger.
 *
 * Badge di Riwayat menampilkan jumlah draft yang gagal dibaca — tanpa itu,
 * draft tersimpan diam-diam tanpa satu pun penanda.
 *
 * Konten baru dirender setelah terpasang di browser; sebelumnya cuma spinner.
 * AppLayout, Table, dan chart Cloudscape membaca lebar layar di render
 * pertama, yang tidak diketahui server. Kalau di-render di server, HTML-nya
 * (anggapan desktop) beda dengan hasil di HP: hydration gagal, React merender
 * ulang semuanya, dan selama menunggu JS menu samping menutupi layar HP.
 * Data tetap diambil di server dan ikut dalam payload halaman, jadi begitu JS
 * siap isinya langsung tampil tanpa permintaan tambahan.
 */
export default function AppShell({
  email,
  draftCount,
  children,
}: {
  email: string | null;
  draftCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const ikuti = useIkuti();

  const terpasang = useTerpasang();
  // Terbuka di layar lebar, tertutup di HP. 688px adalah batas mobile AppLayout.
  // Aman dibaca di sini karena AppLayout tidak pernah dirender di server.
  const [navBuka, setNavBuka] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 689px)").matches,
  );

  async function keluar() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Detail transaksi dibuka dari daftar, jadi menyorot Riwayat.
  const aktif = pathname.startsWith("/rekening")
    ? "/rekening"
    : pathname.startsWith("/riwayat") || pathname.startsWith("/transactions")
      ? "/riwayat"
      : "/";

  return (
    <>
      <div id="top-nav" style={{ position: "sticky", top: 0, zIndex: 1002 }}>
        <TopNavigation
          identity={{
            href: "/",
            title: "Money Tracker",
            logo: { src: "/logo.png", alt: "" },
            onFollow: (e) => {
              e.preventDefault();
              router.push("/");
            },
          }}
          utilities={[
            {
              type: "menu-dropdown",
              iconName: "user-profile",
              text: email ?? "Akun",
              description: email ?? undefined,
              items: [{ id: "keluar", text: "Keluar", iconName: "sign-out" }],
              onItemClick: (e) => {
                if (e.detail.id === "keluar") void keluar();
              },
            },
          ]}
        />
      </div>

      {terpasang ? (
        <AppLayout
          headerSelector="#top-nav"
          toolsHide
          navigationOpen={navBuka}
          onNavigationChange={(e) => setNavBuka(e.detail.open)}
          navigation={
            <SideNavigation
              activeHref={aktif}
              onFollow={ikuti}
              items={[
                { type: "link", text: "Beranda", href: "/" },
                {
                  type: "link",
                  text: "Riwayat",
                  href: "/riwayat",
                  info: draftCount > 0 ? <Badge color="red">{draftCount}</Badge> : undefined,
                },
                { type: "link", text: "Rekening", href: "/rekening" },
              ]}
            />
          }
          content={children}
        />
      ) : (
        <Box textAlign="center" padding="xxxl">
          <Spinner size="large" />
        </Box>
      )}
    </>
  );
}
