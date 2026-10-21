"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut, Shapes, Target, UserRound, Wallet } from "lucide-react";
import { useKategori } from "@/components/Catat";
import { AppBar } from "@/components/oneui";
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
            ket={jumlahKantong > 0 ? `${jumlahKantong} kantong · saldo awal & tanggalnya` : "Rekening, e-wallet, tunai, dan saldo awalnya"}
          />
          <BarisMenu
            href="/pengaturan/kategori"
            ikon={Shapes}
            warna="#ff9f43"
            judul="Kategori"
            ket={`${kategori.length} kategori pengeluaran & pemasukan`}
          />
          <BarisMenu
            href="/pengaturan/budget"
            ikon={Target}
            warna="#3e91ff"
            judul="Budget"
            ket={jumlahBudget > 0 ? `${jumlahBudget} kategori dibatasi` : "Batas pengeluaran per kategori"}
          />
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
