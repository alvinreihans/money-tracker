"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import s from "@/components/ui.module.css";
import { geserHari, isoLokal, namaBulan } from "@/lib/format";
import { geserBulan, gridBulan, ketukTanggal, type Rentang } from "@/lib/kalender";

const NAMA_HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const fmtPanjang = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const fmtJudul = (iso: string, tahun: boolean) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...(tahun ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Kalender pilih rentang ala Kalender Samsung (filter Riwayat): ketuk tanggal
 * awal lalu tanggal akhir; hari di antaranya disorot sebagai satu pita, kedua
 * ujungnya bulatan penuh, hari ini bercincin, Minggu merah. Panah kiri/kanan/
 * atas/bawah memindah fokus antar-hari (desktop).
 */
export default function KalenderRentang({ nilai, onChange }: { nilai: Rentang; onChange: (r: Rentang) => void }) {
  const hariIni = isoLokal(new Date());
  const [bulan, setBulan] = useState((nilai.sampai ?? nilai.dari ?? hariIni).slice(0, 7));
  const [fokus, setFokus] = useState(nilai.dari ?? hariIni);
  const gridRef = useRef<HTMLDivElement>(null);
  const pindahFokus = useRef(false);

  // Fokus keyboard ikut tanggal yang dipilih panah, termasuk saat ganti bulan.
  useEffect(() => {
    if (!pindahFokus.current) return;
    pindahFokus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-tgl="${fokus}"]`)?.focus();
  }, [fokus, bulan]);

  function tombol(e: React.KeyboardEvent) {
    const geser = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!geser) return;
    e.preventDefault();
    const baru = geserHari(fokus, geser);
    pindahFokus.current = true;
    setFokus(baru);
    if (baru.slice(0, 7) !== bulan) setBulan(baru.slice(0, 7));
  }

  const { dari, sampai } = nilai;
  const tahunBeda = Boolean(dari && sampai && dari.slice(0, 4) !== sampai.slice(0, 4)) || Boolean(dari && dari.slice(0, 4) !== hariIni.slice(0, 4));
  const judul = !dari
    ? "Pilih tanggal awal"
    : !sampai
      ? `${fmtJudul(dari, tahunBeda)} – …`
      : dari === sampai
        ? fmtJudul(dari, true)
        : `${fmtJudul(dari, tahunBeda)} – ${fmtJudul(sampai, true)}`;
  const namaBulanIni = namaBulan(`${bulan}-01`);
  const sel = gridBulan(bulan);
  // Tanggal fokus selalu ada di bulan yang tampil, supaya Tab masuk ke grid.
  const fokusDiSini = fokus.slice(0, 7) === bulan ? fokus : `${bulan}-01`;

  return (
    <div className={s.kalender}>
      <p className={s.kalenderRentang} aria-live="polite">
        {judul}
      </p>
      <div className={s.kalenderKepala}>
        <button type="button" className={s.ikonTombol} aria-label="Bulan sebelumnya" onClick={() => setBulan(geserBulan(bulan, -1))}>
          <ChevronLeft size={22} />
        </button>
        <span>
          {namaBulanIni.charAt(0).toUpperCase() + namaBulanIni.slice(1)} {bulan.slice(0, 4)}
        </span>
        <button type="button" className={s.ikonTombol} aria-label="Bulan berikutnya" onClick={() => setBulan(geserBulan(bulan, 1))}>
          <ChevronRight size={22} />
        </button>
      </div>
      <div ref={gridRef} className={s.kalenderGrid} role="group" aria-label={`Tanggal ${namaBulanIni} ${bulan.slice(0, 4)}`} onKeyDown={tombol}>
        {NAMA_HARI.map((h, i) => (
          <span key={h} className={s.kalenderNamaHari} data-minggu={i === 6} aria-hidden>
            {h}
          </span>
        ))}
        {sel.map((tgl, i) => {
          if (!tgl) return <span key={`k${i}`} aria-hidden />;
          const awal = tgl === dari;
          const akhir = tgl === sampai;
          const antara = Boolean(dari && sampai && tgl > dari && tgl < sampai);
          return (
            <button
              key={tgl}
              type="button"
              data-tgl={tgl}
              className={s.kalenderTgl}
              data-awal={awal && Boolean(sampai) && dari !== sampai}
              data-akhir={akhir && dari !== sampai}
              data-antara={antara}
              data-ujung={awal || akhir}
              data-hari-ini={tgl === hariIni}
              data-minggu={i % 7 === 6}
              aria-pressed={awal || akhir || antara}
              aria-label={fmtPanjang(tgl)}
              tabIndex={tgl === fokusDiSini ? 0 : -1}
              onFocus={() => setFokus(tgl)}
              onClick={() => onChange(ketukTanggal(nilai, tgl))}
            >
              <span>{Number(tgl.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
