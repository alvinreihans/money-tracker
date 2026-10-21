"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ActionList, ActionMenu, Header, IconButton, UnderlineNav } from "@primer/react";
import { CreditCardIcon, HistoryIcon, HomeIcon, PersonIcon, SignOutIcon } from "@primer/octicons-react";
import { CatatProvider, KabarCatat, MenuCatat } from "@/components/Catat";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Kerangka aplikasi, mengikuti halaman repo GitHub: header gelap (logo,
 * tombol "+", akun) lalu tab bergaris bawah.
 *
 * Tab, bukan menu hamburger: cuma tiga tujuan, jadi semuanya muat dan tetap
 * satu ketukan di HP. Counter di Riwayat menampilkan jumlah draft yang gagal
 * dibaca — tanpa itu, draft tersimpan diam-diam tanpa satu pun penanda.
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

  const tab = [
    { href: "/", label: "Beranda", icon: HomeIcon },
    { href: "/riwayat", label: "Riwayat", icon: HistoryIcon, counter: draftCount || undefined },
    { href: "/rekening", label: "Rekening", icon: CreditCardIcon },
  ];

  return (
    <CatatProvider>
      <Header>
        <Header.Item full>
          <NextLink href="/" className={s.logo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={32} height={32} />
            Money Tracker
          </NextLink>
        </Header.Item>
        <Header.Item>
          <MenuCatat />
        </Header.Item>
        <Header.Item style={{ marginRight: 0 }}>
          <ActionMenu>
            <ActionMenu.Anchor>
              <IconButton icon={PersonIcon} aria-label="Akun" />
            </ActionMenu.Anchor>
            <ActionMenu.Overlay align="end">
              <ActionList>
                <ActionList.Group>
                  <ActionList.GroupHeading>{email ?? "Akun"}</ActionList.GroupHeading>
                  <ActionList.Item variant="danger" onSelect={() => void keluar()}>
                    <ActionList.LeadingVisual>
                      <SignOutIcon />
                    </ActionList.LeadingVisual>
                    Keluar
                  </ActionList.Item>
                </ActionList.Group>
              </ActionList>
            </ActionMenu.Overlay>
          </ActionMenu>
        </Header.Item>
      </Header>

      <div className={s.navWrap}>
        <UnderlineNav aria-label="Navigasi utama">
          {tab.map((t) => (
            <UnderlineNav.Item
              key={t.href}
              as={NextLink}
              href={t.href}
              icon={t.icon}
              counter={t.counter}
              aria-current={aktif === t.href ? "page" : undefined}
            >
              {t.label}
            </UnderlineNav.Item>
          ))}
        </UnderlineNav>
      </div>

      <main className={s.halaman}>
        <KabarCatat />
        {children}
      </main>
    </CatatProvider>
  );
}
