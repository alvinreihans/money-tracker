"use client";

import { useEffect, useRef } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardList, Flame, Inbox } from "lucide-react";
import { useCatat } from "@/components/Catat";
import KartuBudget from "@/components/KartuBudget";
import KartuKantong from "@/components/KartuKantong";
import KartuPinjaman from "@/components/KartuPinjaman";
import KomposisiKategori from "@/components/KomposisiKategori";
import MenuAkun from "@/components/MenuAkun";
import { AppBar, Kosong } from "@/components/oneui";
import RingkasanBulan from "@/components/RingkasanBulan";
import TransactionList from "@/components/TransactionList";
import TrenBulanan from "@/components/TrenBulanan";
import s from "@/components/ui.module.css";
import { fmtIDR, namaBulan } from "@/lib/format";
import { rentangBulan } from "@/lib/periode";
import type { RingkasBeranda } from "@/lib/pinjaman";
import type { Bulan, ProgresBudget } from "@/lib/analitik";
import type { AvgMonthlyExpenseRow, Transaction } from "@/types/transaction";

export default function BerandaView({
  ringkasan,
  draft,
  terbaru,
  rerata,
  rerataError,
  tren,
  kantong,
  pinjaman,
  budget,
  streak,
  bukaCatat,
}: {
  ringkasan: { keluar: number; masuk: number; keluarBulanLalu: number };
  draft: number;
  terbaru: Transaction[];
  rerata: AvgMonthlyExpenseRow[];
  rerataError: string | null;
  tren: Bulan[];
  kantong: React.ComponentProps<typeof KartuKantong>["data"];
  pinjaman: RingkasBeranda;
  budget: ProgresBudget[];
  streak: { hari: number; hariIni: boolean };
  /** ?catat=<id> dari push: buka percakapan catatan itu. */
  bukaCatat?: string;
}) {
  const catat = useCatat();
  const router = useRouter();

  // Sekali per tautan: efek berjalan dua kali di mode dev (StrictMode).
  const sudah = useRef<string | null>(null);
  useEffect(() => {
    if (!bukaCatat || sudah.current === bukaCatat) return;
    sudah.current = bukaCatat;
    catat.bukaDraft(bukaCatat);
    router.replace("/", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bukaCatat]);
  const { keluar, masuk, keluarBulanLalu } = ringkasan;
  const { awalBulanIni, awalBulanLalu } = rentangBulan();
  const persen = keluarBulanLalu > 0 ? Math.round(((keluar - keluarBulanLalu) / keluarBulanLalu) * 100) : 0;

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
        aksi={<MenuAkun />}
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
          <button type="button" className={`${s.blok} ${s.baris} ${s.tekan}`} onClick={catat.bukaDaftar}>
            <span className={`${s.barisIkon} ${s.peringatan}`} aria-hidden>
              <ClipboardList size={20} />
            </span>
            <span className={s.barisTeks}>
              <span className={s.barisJudul}>{draft} catatan belum selesai</span>
              <span className={s.redup}>Ketuk untuk melengkapi</span>
            </span>
            <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
          </button>
        )}

        {/* Cuma hari ini & kemarin — Beranda untuk sekilas, riwayat lengkap di
            tab Riwayat. */}
        {terbaru.length > 0 ? (
          <TransactionList
            kembali="/"
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
              <button type="button" className={s.tombol} style={{ marginTop: 16 }} onClick={() => catat.buka()}>
                Catat transaksi
              </button>
            </Kosong>
            <NextLink href="/riwayat" className={s.blokKaki}>
              Lihat semua riwayat
            </NextLink>
          </div>
        )}

        <KartuKantong data={kantong} />
        <KartuPinjaman data={pinjaman} />
        <KartuBudget data={budget} bulan={namaBulan(awalBulanIni)} />
        <TrenBulanan data={tren} />
        <KomposisiKategori data={rerata} error={rerataError} />
      </div>
    </>
  );
}
