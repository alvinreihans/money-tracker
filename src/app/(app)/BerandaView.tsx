"use client";

import { useEffect, useRef } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardList, Inbox } from "lucide-react";
import BarisStreak from "@/components/BarisStreak";
import { useCatat } from "@/components/Catat";
import KartuBudget from "@/components/KartuBudget";
import KartuMetode from "@/components/KartuMetode";
import KartuKantong from "@/components/KartuKantong";
import KartuPinjaman from "@/components/KartuPinjaman";
import { AppBar, Kosong } from "@/components/oneui";
import { TombolTanya } from "@/components/TanyaAI";
import TransactionList from "@/components/TransactionList";
import s from "@/components/ui.module.css";
import { fmtIDR, namaBulan } from "@/lib/format";
import { rentangBulan } from "@/lib/periode";
import type { RingkasBeranda } from "@/lib/pinjaman";
import type { ProgresBudget } from "@/lib/analitik";
import type { HasilMetode } from "@/lib/metode";
import type { InfoPecahan } from "@/lib/riwayat";
import type { Transaction } from "@/types/transaction";

export default function BerandaView({
  ringkasan,
  draft,
  terbaru,
  kantong,
  pinjaman,
  budget,
  streak,
  bukaCatat,
  metode,
  pecahan,
}: {
  ringkasan: { keluar: number; keluarBulanLalu: number };
  draft: number;
  terbaru: Transaction[];
  kantong: React.ComponentProps<typeof KartuKantong>["data"];
  pinjaman: RingkasBeranda;
  budget: ProgresBudget[];
  streak: { hari: number; hariIni: boolean };
  /** Metode budgeting aktif (SPEC-metode-budget); null = budget per kategori. */
  metode: HasilMetode | null;
  /** Transaksi yang dipecah: total per transaksi asli (SPEC-metode-budget). */
  pecahan: InfoPecahan;
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
    // "baru": pintasan "Catat" di ikon aplikasi (manifest); selain itu id draft.
    if (bukaCatat === "baru") catat.buka();
    else catat.bukaDraft(bukaCatat);
    router.replace("/", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bukaCatat]);
  const { keluar, keluarBulanLalu } = ringkasan;
  // Budget yang perlu perhatian (> 80% terpakai); selengkapnya di Analitik.
  const budgetWaspada = budget.filter((b) => b.status !== "aman");
  const { awalBulanIni, awalBulanLalu } = rentangBulan();
  const persen = keluarBulanLalu > 0 ? Math.round(((keluar - keluarBulanLalu) / keluarBulanLalu) * 100) : 0;

  return (
    <>
      {/* Judul dinamis: yang paling ingin dilihat saat membuka aplikasi —
          berapa yang sudah keluar bulan ini — jadi judul besar. Arah
          perubahannya dibawa panah dan teks, bukan warna saja. Diketuk →
          Analitik (SPEC-navigasi). */}
      <AppBar
        judul={
          <NextLink href="/analitik" className={s.tautanJudul}>
            {fmtIDR(keluar)}
          </NextLink>
        }
        judulKecil="Beranda"
        sub={
          <NextLink href="/analitik" className={s.tautanJudul}>
            keluar di {namaBulan(awalBulanIni)}
            {persen !== 0 && (
              <>
                <br />
                {persen > 0 ? "↑ naik" : "↓ turun"} {Math.abs(persen)}% dari {namaBulan(awalBulanLalu)}
              </>
            )}
            <ChevronRight size={16} aria-hidden style={{ verticalAlign: "-3px", marginLeft: 2 }} />
          </NextLink>
        }
      />

      {/* "Hari ini & yang perlu perhatian" (SPEC-navigasi); grafik ada di Analitik. */}
      {/* Layar lebar: kartu mengalir ke dua kolom (SPEC-layar-lebar). */}
      <div className={`${s.isi} ${s.isiKolom} ${s.lebar}`}>
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

        {/* Cuma 5 terakhir — Beranda untuk sekilas, riwayat lengkap di tab Riwayat. */}
        {terbaru.length > 0 ? (
          // Satu kesatuan, supaya di dua kolom "Lihat semua" tidak terpisah dari daftarnya.
          <div className={s.tumpuk}>
            <TransactionList
              kembali="/"
              items={terbaru}
              pecahan={pecahan}
              kaki={
                <NextLink href="/riwayat" className={`${s.kartuTx} ${s.kartuKaki} ${s.tekan}`}>
                  Lihat semua riwayat
                </NextLink>
              }
            />
          </div>
        ) : (
          <div className={s.blok}>
            <Kosong ikon={Inbox} judul="Belum ada transaksi">
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
        {metode ? (
          // Hanya kelompok yang ≥ 80% jatahnya; kartu tidak tampil kalau semua aman.
          <KartuMetode hasil={metode} judul="Budget hampir habis" />
        ) : (
          budgetWaspada.length > 0 && <KartuBudget data={budgetWaspada} bulan={namaBulan(awalBulanIni)} judul="Budget hampir habis" />
        )}
        <BarisStreak streak={streak} />
      </div>
      {/* Pintasan Tanya AI (SPEC-cerita-tanya), sama dengan di Analitik. */}
      <TombolTanya />
    </>
  );
}
