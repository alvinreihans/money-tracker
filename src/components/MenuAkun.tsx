"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { useCatat } from "@/components/Catat";
import { MenuLainnya } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Menu ⋮ di app bar Beranda dan Riwayat: Pengaturan, Keluar, dan email yang
 * sedang masuk. Satu komponen supaya isinya sama di kedua halaman.
 */
export default function MenuAkun() {
  const router = useRouter();
  const { email } = useCatat();

  async function keluar() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <MenuLainnya>
      <NextLink href="/pengaturan" className={s.baris}>
        <Settings size={20} color="var(--teks-2)" aria-hidden />
        <span>Pengaturan</span>
      </NextLink>
      <button type="button" className={s.baris} onClick={() => void keluar()}>
        <LogOut size={20} color="var(--bahaya)" aria-hidden />
        <span className={s.bahaya}>Keluar</span>
      </button>
      {email && <div className={s.versi}>{email}</div>}
    </MenuLainnya>
  );
}
