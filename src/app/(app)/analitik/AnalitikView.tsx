"use client";

import { useState } from "react";
import NextLink from "next/link";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Sparkles, Store, TrendingUp } from "lucide-react";
import { useKategori } from "@/components/Catat";
import KartuBudget from "@/components/KartuBudget";
import KomposisiKategori from "@/components/KomposisiKategori";
import { AppBar } from "@/components/oneui";
import RingkasanBulan from "@/components/RingkasanBulan";
import TanyaAI from "@/components/TanyaAI";
import TrenBulanan from "@/components/TrenBulanan";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtIDRRingkas, geserHari, namaBulan } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";
import { namaKategori } from "@/lib/kategori";
import { alamatRiwayat, FILTER_KOSONG, type FilterRiwayat } from "@/lib/riwayat";
import type { AnalisisBulan, Bulan, ProgresBudget } from "@/lib/analitik";

const Besar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const fmtHari = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Satu baris sorotan: ikon berwarna, kalimat, keterangan; membuka Riwayat. */
function Sorotan({ ikon: Ikon, warna, judul, sub, href }: { ikon: React.ElementType; warna: string; judul: string; sub: string; href?: string }) {
  const isi = (
    <>
      <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
        <Ikon size={20} />
      </span>
      <span className={s.barisTeks}>
        <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>
          {judul}
        </span>
        <span className={s.redup}>{sub}</span>
      </span>
      {href && <ChevronRight size={18} color="var(--teks-2)" aria-hidden />}
    </>
  );
  return href ? (
    <NextLink href={href} className={`${s.baris} ${s.tekan}`}>
      {isi}
    </NextLink>
  ) : (
    <div className={s.baris}>{isi}</div>
  );
}

/**
 * Tab Analitik (SPEC-analitik-insight): pilih bulan, ringkasan dibanding
 * bulan lalu, sorotan, kategori, merchant teratas, tren, dan budget. Hampir
 * semua baris membuka Riwayat yang sudah tersaring ke bulan itu.
 */
export default function AnalitikView({
  bulan,
  bulanIni,
  analisis: a,
  tren,
  budget,
  totalBudget,
}: {
  /** "YYYY-MM" terpilih */
  bulan: string;
  /** "YYYY-MM" berjalan */
  bulanIni: string;
  analisis: AnalisisBulan;
  tren: Bulan[];
  budget: ProgresBudget[];
  totalBudget: number;
}) {
  const kategori = useKategori();
  const [tanya, setTanya] = useState(false);
  const awal = `${bulan}-01`;
  const akhir = geserHari(`${geserBulan(bulan, 1)}-01`, -1);
  const label = `${Besar(namaBulan(awal))} ${bulan.slice(0, 4)}`;
  const bulanLalu = Besar(namaBulan(`${geserBulan(bulan, -1)}-01`));
  const keRiwayat = (f: Partial<FilterRiwayat>) => alamatRiwayat({ ...FILTER_KOSONG, dari: awal, sampai: akhir, ...f });
  const alamatBulan = (b: string) => (b === bulanIni ? "/analitik" : `/analitik?bulan=${b}`);

  const sering = [...a.merchant].sort((x, y) => y.kali - x.kali || y.total - x.total)[0];
  const sorotan = [
    a.proyeksi != null && (
      <Sorotan
        key="proyeksi"
        ikon={TrendingUp}
        warna="#3e91ff"
        judul={`Kalau begini terus, bulan ini keluar ± ${fmtIDRRingkas(a.proyeksi)}`}
        sub={
          totalBudget > 0
            ? a.proyeksi > totalBudget
              ? `Lewat ${fmtIDRRingkas(a.proyeksi - totalBudget)} dari total budget ${fmtIDRRingkas(totalBudget)}`
              : `Masih di bawah total budget ${fmtIDRRingkas(totalBudget)}`
            : "Dari rata-rata pengeluaran per hari sejauh ini."
        }
      />
    ),
    a.hariBoros && (
      <Sorotan
        key="boros"
        ikon={CalendarDays}
        warna="#ff8a3d"
        judul={`Paling boros: ${fmtHari(a.hariBoros.tanggal)}`}
        sub={fmtIDR(a.hariBoros.total)}
        href={keRiwayat({ jenis: "keluar", dari: a.hariBoros.tanggal, sampai: a.hariBoros.tanggal })}
      />
    ),
    sering && sering.kali > 1 && (
      <Sorotan
        key="sering"
        ikon={Store}
        warna="#bf7af0"
        judul={`Paling sering: ${sering.nama}`}
        sub={`${sering.kali}× · ${fmtIDR(sering.total)}`}
        href={keRiwayat({ jenis: "keluar", q: sering.nama })}
      />
    ),
    a.kategoriNaik && (
      <Sorotan
        key="naik"
        ikon={ArrowUpRight}
        warna="#ff6b6b"
        judul={`${namaKategori(kategori, a.kategoriNaik.kategori, "expense")} naik ${fmtIDRRingkas(a.kategoriNaik.selisih)}${
          a.kategoriNaik.persen != null ? ` (+${a.kategoriNaik.persen}%)` : ""
        }`}
        sub={a.kategoriNaik.persen != null ? `dari ${bulanLalu}` : `${bulanLalu} belum ada`}
        href={keRiwayat({ jenis: "keluar", kategori: [`expense:${a.kategoriNaik.kategori}`] })}
      />
    ),
  ].filter(Boolean);

  return (
    <>
      {/* Bulannya di pemilih bulan di bawah, tidak diulang di subjudul. */}
      <AppBar judul="Analitik" />
      <div className={s.isi}>
        <nav className={s.pilihBulan} aria-label="Pilih bulan">
          <NextLink href={alamatBulan(geserBulan(bulan, -1))} className={s.ikonTombol} aria-label={`Bulan sebelumnya: ${bulanLalu}`}>
            <ChevronLeft size={24} />
          </NextLink>
          <span aria-live="polite">{label}</span>
          {bulan < bulanIni ? (
            <NextLink href={alamatBulan(geserBulan(bulan, 1))} className={s.ikonTombol} aria-label="Bulan berikutnya">
              <ChevronRight size={24} />
            </NextLink>
          ) : (
            // Bulan depan belum ada isinya.
            <span className={s.ikonTombol} style={{ opacity: 0.3 }} aria-hidden>
              <ChevronRight size={24} />
            </span>
          )}
        </nav>

        {/* Tanya AI (SPEC-analitik-ai): angka dari database, AI menjelaskan. */}
        <button type="button" className={`${s.blok} ${s.baris} ${s.tekan}`} onClick={() => setTanya(true)}>
          <span className={s.barisIkon} style={{ background: "color-mix(in srgb, #bf7af0 18%, transparent)", color: "#bf7af0" }} aria-hidden>
            <Sparkles size={20} />
          </span>
          <span className={s.barisTeks}>
            <span className={s.barisJudul}>Tanya soal keuanganmu</span>
            <span className={s.redup}>Mis. “Kenapa {Besar(namaBulan(awal))} boros?”</span>
          </span>
          <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
        </button>

        <RingkasanBulan
          keluar={a.keluar}
          masuk={a.masuk}
          perubahan={a.perubahanKeluar}
          bulanLalu={bulanLalu}
          hrefKeluar={keRiwayat({ jenis: "keluar" })}
          hrefMasuk={keRiwayat({ jenis: "masuk" })}
        />

        {sorotan.length > 0 && (
          <section className={s.blok}>
            <div className={s.blokIsi} style={{ paddingBottom: 4 }}>
              <h2 className={s.blokJudul}>Sorotan</h2>
            </div>
            {sorotan}
          </section>
        )}

        <KomposisiKategori
          data={a.kategori}
          total={a.keluar}
          bulanLalu={bulanLalu}
          href={(k) => keRiwayat({ jenis: "keluar", kategori: [`expense:${k}`] })}
        />

        {a.merchant.length > 0 && (
          <section className={s.blok}>
            <div className={s.blokIsi} style={{ paddingBottom: 4 }}>
              <h2 className={s.blokJudul}>Merchant teratas</h2>
            </div>
            {a.merchant.map((m) => (
              <NextLink key={m.nama} href={keRiwayat({ jenis: "keluar", q: m.nama })} className={`${s.baris} ${s.tekan}`}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul}>{m.nama}</span>
                  <span className={s.redup}>{m.kali}× transaksi</span>
                </span>
                <span className={s.nominal}>{fmtIDR(m.total)}</span>
                <ChevronRight size={18} color="var(--teks-2)" aria-hidden />
              </NextLink>
            ))}
          </section>
        )}

        <TrenBulanan data={tren} />
        <KartuBudget data={budget} bulan={namaBulan(awal)} />
      </div>
      {tanya && <TanyaAI bulan={bulan} namaBulan={Besar(namaBulan(awal))} namaBulanLalu={bulanLalu} onClose={() => setTanya(false)} />}
    </>
  );
}
