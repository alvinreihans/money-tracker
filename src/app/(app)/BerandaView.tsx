"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Inbox, LogOut, TriangleAlert, UserRound } from "lucide-react";
import { useCatat } from "@/components/Catat";
import KomposisiKategori from "@/components/KomposisiKategori";
import { AppBar, Kosong, MenuLainnya } from "@/components/oneui";
import RingkasanBulan from "@/components/RingkasanBulan";
import TransactionList from "@/components/TransactionList";
import s from "@/components/ui.module.css";
import { fmtIDR, namaBulan } from "@/lib/format";
import { rentangBulan } from "@/lib/periode";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AvgMonthlyExpenseRow, Transaction } from "@/types/transaction";

export default function BerandaView({
  email,
  ringkasan,
  draft,
  terbaru,
  rerata,
  rerataError,
}: {
  email: string | null;
  ringkasan: { keluar: number; masuk: number; keluarBulanLalu: number };
  draft: number;
  terbaru: Transaction[];
  rerata: AvgMonthlyExpenseRow[];
  rerataError: string | null;
}) {
  const router = useRouter();
  const catat = useCatat();
  const { keluar, masuk, keluarBulanLalu } = ringkasan;
  const { awalBulanIni, awalBulanLalu } = rentangBulan();
  const persen = keluarBulanLalu > 0 ? Math.round(((keluar - keluarBulanLalu) / keluarBulanLalu) * 100) : 0;

  async function keluarAkun() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Judul dinamis: yang paling ingin dilihat saat membuka aplikasi —
          berapa yang sudah keluar bulan ini — jadi judul besar. Arah
          perubahannya dibawa panah dan teks, bukan warna saja. */}
      <AppBar
        judul={fmtIDR(keluar)}
        judulKecil="Beranda"
        sub={
          <>
            keluar di {namaBulan(awalBulanIni)}
            {persen !== 0 && (
              <>
                <br />
                {persen > 0 ? "↑ naik" : "↓ turun"} {Math.abs(persen)}% dari {namaBulan(awalBulanLalu)}
              </>
            )}
          </>
        }
        aksi={
          <>
            <MenuLainnya>
              {email && (
                <div className={s.baris} style={{ minHeight: 52 }}>
                  <UserRound size={20} color="var(--teks-2)" aria-hidden />
                  <span className={`${s.barisTeks} ${s.redup}`}>{email}</span>
                </div>
              )}
              <button type="button" className={s.baris} onClick={() => void keluarAkun()}>
                <LogOut size={20} color="var(--bahaya)" aria-hidden />
                <span className={s.bahaya}>Keluar</span>
              </button>
            </MenuLainnya>
          </>
        }
      />

      <div className={s.isi}>
        <RingkasanBulan keluar={keluar} masuk={masuk} />

        {draft > 0 && (
          <NextLink href="/riwayat?filter=draft" className={`${s.blok} ${s.baris} ${s.tekan}`}>
            <span className={`${s.barisIkon} ${s.peringatan}`} aria-hidden>
              <TriangleAlert size={20} />
            </span>
            <span className={s.barisTeks}>
              <span className={s.barisJudul}>{draft} transaksi perlu dibenerin</span>
              <span className={s.redup}>Belum ikut dihitung di ringkasan.</span>
            </span>
            <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
          </NextLink>
        )}

        {terbaru.length > 0 ? (
          <>
            <TransactionList items={terbaru} />
            <NextLink
              href="/riwayat"
              className={`${s.blok} ${s.baris} ${s.tekan}`}
              style={{ minHeight: 52, justifyContent: "center" }}
            >
              Lihat semua riwayat
            </NextLink>
          </>
        ) : (
          <div className={s.blok}>
            <Kosong ikon={Inbox} judul="Belum ada transaksi">
              Ketik aja, mis. &ldquo;beli makan warteg 20k&rdquo;.
              <br />
              <button type="button" className={s.tombol} style={{ marginTop: 16 }} onClick={catat.buka}>
                Catat transaksi
              </button>
            </Kosong>
          </div>
        )}

        <KomposisiKategori data={rerata} error={rerataError} />
      </div>
    </>
  );
}
