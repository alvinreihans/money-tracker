"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Flame, Inbox, LogOut, Settings, TriangleAlert } from "lucide-react";
import { useCatat } from "@/components/Catat";
import KartuBudget from "@/components/KartuBudget";
import KartuKantong from "@/components/KartuKantong";
import KomposisiKategori from "@/components/KomposisiKategori";
import { AppBar, Kosong, MenuLainnya } from "@/components/oneui";
import RingkasanBulan from "@/components/RingkasanBulan";
import TransactionList from "@/components/TransactionList";
import TrenBulanan from "@/components/TrenBulanan";
import s from "@/components/ui.module.css";
import { fmtIDR, namaBulan } from "@/lib/format";
import { rentangBulan } from "@/lib/periode";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Bulan, ProgresBudget } from "@/lib/analitik";
import type { AvgMonthlyExpenseRow, Transaction } from "@/types/transaction";

export default function BerandaView({
  email,
  ringkasan,
  draft,
  terbaru,
  rerata,
  rerataError,
  tren,
  kantong,
  budget,
  streak,
}: {
  email: string | null;
  ringkasan: { keluar: number; masuk: number; keluarBulanLalu: number };
  draft: number;
  terbaru: Transaction[];
  rerata: AvgMonthlyExpenseRow[];
  rerataError: string | null;
  tren: Bulan[];
  kantong: React.ComponentProps<typeof KartuKantong>["data"];
  budget: ProgresBudget[];
  streak: { hari: number; hariIni: boolean };
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
              <NextLink href="/pengaturan" className={s.baris}>
                <Settings size={20} color="var(--teks-2)" aria-hidden />
                <span>Pengaturan</span>
              </NextLink>
              <button type="button" className={s.baris} onClick={() => void keluarAkun()}>
                <LogOut size={20} color="var(--bahaya)" aria-hidden />
                <span className={s.bahaya}>Keluar</span>
              </button>
              {email && <div className={s.versi}>{email}</div>}
            </MenuLainnya>
          </>
        }
      />

      <div className={s.isi}>
        <RingkasanBulan keluar={keluar} masuk={masuk} />

        {/* Penyemangat ala "reward karena rajin isi" di spreadsheet. */}
        <div className={`${s.blok} ${s.baris}`}>
          <span className={s.barisIkon} style={{ background: "color-mix(in srgb, #ff8a3d 18%, transparent)", color: "#ff8a3d" }} aria-hidden>
            <Flame size={20} />
          </span>
          <span className={s.barisTeks}>
            <span className={s.barisJudul}>
              {streak.hari > 0 ? `${streak.hari} hari berturut-turut mencatat` : "Mulai streak hari ini"}
            </span>
            <span className={s.redup}>
              {streak.hari === 0
                ? "Catat satu transaksi tiap hari."
                : streak.hariIni
                  ? "Hari ini sudah tercatat. Mantap!"
                  : "Catat hari ini biar nggak putus."}
            </span>
          </span>
        </div>

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

        {/* Cuma hari ini & kemarin — Beranda untuk sekilas, riwayat lengkap di
            tab Riwayat. */}
        {terbaru.length > 0 ? (
          <TransactionList
            items={terbaru}
            kaki={
              <NextLink href="/riwayat" className={`${s.kartuTx} ${s.kartuKaki} ${s.tekan}`}>
                Lihat semua riwayat
              </NextLink>
            }
          />
        ) : (
          <div className={s.blok}>
            <Kosong ikon={Inbox} judul="Belum ada transaksi hari ini">
              Ketik aja, mis. &ldquo;beli makan di warteg 20k shopeepay&rdquo;.
              <br />
              <button type="button" className={s.tombol} style={{ marginTop: 16 }} onClick={catat.buka}>
                Catat transaksi
              </button>
            </Kosong>
            <NextLink href="/riwayat" className={s.blokKaki}>
              Lihat semua riwayat
            </NextLink>
          </div>
        )}

        <KartuKantong data={kantong} />
        <KartuBudget data={budget} bulan={namaBulan(awalBulanIni)} />
        <TrenBulanan data={tren} />
        <KomposisiKategori data={rerata} error={rerataError} />
      </div>
    </>
  );
}
