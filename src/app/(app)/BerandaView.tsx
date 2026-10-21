"use client";

import NextLink from "next/link";
import { ChevronRight, Inbox, TriangleAlert } from "lucide-react";
import { useCatat } from "@/components/Catat";
import KomposisiKategori from "@/components/KomposisiKategori";
import { AppBar, Kosong } from "@/components/oneui";
import RingkasanBulan from "@/components/RingkasanBulan";
import TransactionList from "@/components/TransactionList";
import s from "@/components/ui.module.css";
import { fmtIDR, namaBulan } from "@/lib/format";
import type { AvgMonthlyExpenseRow, Transaction } from "@/types/transaction";

export default function BerandaView({
  ringkasan,
  draft,
  terbaru,
  rerata,
  rerataError,
}: {
  ringkasan: { keluar: number; masuk: number; keluarBulanLalu: number };
  draft: number;
  terbaru: Transaction[];
  rerata: AvgMonthlyExpenseRow[];
  rerataError: string | null;
}) {
  const catat = useCatat();
  const { keluar, masuk, keluarBulanLalu } = ringkasan;

  const sekarang = new Date();
  const bulanLalu = new Date();
  bulanLalu.setDate(1);
  bulanLalu.setMonth(bulanLalu.getMonth() - 1);
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
            keluar di {namaBulan(sekarang)}
            {persen !== 0 && (
              <>
                <br />
                {persen > 0 ? "↑ naik" : "↓ turun"} {Math.abs(persen)}% dari {namaBulan(bulanLalu)}
              </>
            )}
          </>
        }
      />

      <div className={s.isi}>
        <RingkasanBulan keluar={keluar} masuk={masuk} />

        {draft > 0 && (
          <NextLink href="/riwayat?filter=draft" className={`${s.blok} ${s.baris}`}>
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

        <h2 className={s.subheader}>Terbaru</h2>
        {terbaru.length > 0 ? (
          <>
            <TransactionList items={terbaru} />
            <NextLink href="/riwayat" className={`${s.blok} ${s.baris}`} style={{ minHeight: 52, justifyContent: "center" }}>
              Lihat semua riwayat
            </NextLink>
          </>
        ) : (
          <div className={s.blok}>
            <Kosong ikon={Inbox} judul="Belum ada transaksi">
              Foto struk, ketik, atau isi sendiri.
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
