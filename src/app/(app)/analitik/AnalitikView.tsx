"use client";

import NextLink from "next/link";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Store, TrendingUp } from "lucide-react";
import { useKategori } from "@/components/Catat";
import KartuBudget from "@/components/KartuBudget";
import KartuMetode from "@/components/KartuMetode";
import KomposisiKategori from "@/components/KomposisiKategori";
import { AppBar } from "@/components/oneui";
import RingkasanBulan from "@/components/RingkasanBulan";
import { TombolTanya, useTanyaBulan, useTanyaLangsung } from "@/components/TanyaAI";
import TrenBulanan from "@/components/TrenBulanan";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtIDRRingkas, geserHari, isoLokal, namaBulan } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";
import { namaKategori } from "@/lib/kategori";
import { alamatRiwayat, FILTER_KOSONG, type FilterRiwayat } from "@/lib/riwayat";
import type { AnalisisBulan, Bulan, ProgresBudget } from "@/lib/analitik";
import type { HasilMetode } from "@/lib/metode";

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
  dariTujuan,
  tren,
  budget,
  totalBudget,
  metode,
  idTujuan,
}: {
  /** "YYYY-MM" terpilih */
  bulan: string;
  /** "YYYY-MM" berjalan */
  bulanIni: string;
  analisis: AnalisisBulan;
  /** Pembelian dari tujuan tabungan bulan itu, per tujuan; tidak ikut di `analisis`. */
  dariTujuan: { id: string; nama: string; total: number }[];
  tren: Bulan[];
  budget: ProgresBudget[];
  totalBudget: number;
  metode: HasilMetode | null;
  /** Kantong tujuan tabungan: tautan wadah setoran ke Riwayat (SPEC-metode-lanjutan). */
  idTujuan: string[];
}) {
  const kategori = useKategori();
  useTanyaBulan(bulan);
  const tanyaLangsung = useTanyaLangsung();
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
      {/* Layar lebar: kartu mengalir ke dua kolom (SPEC-layar-lebar). */}
      <div className={`${s.isi} ${s.isiKolom} ${s.lebar}`}>
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

        <RingkasanBulan
          keluar={a.keluar}
          masuk={a.masuk}
          perubahan={a.perubahanKeluar}
          bulanLalu={bulanLalu}
          hrefKeluar={keRiwayat({ jenis: "keluar" })}
          hrefMasuk={keRiwayat({ jenis: "masuk" })}
          dariTujuan={
            dariTujuan.length > 0
              ? {
                  total: dariTujuan.reduce((n, t) => n + t.total, 0),
                  nama: dariTujuan.map((t) => t.nama).join(", "),
                  href: keRiwayat({ jenis: "keluar", kantong: dariTujuan.map((t) => t.id) }),
                }
              : null
          }
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
        {metode && metode.metode !== "zero-based" ? (
          <KartuMetode
            hasil={metode}
            // Setoran ke tujuan → pindah kantong tujuan; sisa & setoran + emas tidak punya satu daftar.
            href={(w) =>
              w.sumber === "setoran-tujuan"
                ? keRiwayat({ jenis: "pindah", kantong: idTujuan })
                : w.sumber === "sisa" || w.sumber === "setoran-total"
                  ? null
                  : keRiwayat({ jenis: "keluar", kelompok: w.kelompok })
            }
          />
        ) : (
          <KartuBudget data={budget} bulan={namaBulan(awal)} />
        )}
        {/* Zero-Based: target per kategori di atas, tabungan & sisa yang belum diberi tugas di sini. */}
        {metode?.metode === "zero-based" && <KartuMetode hasil={metode} />}
        {/* Kakeibo: refleksi akhir bulan lewat Tanya AI, mulai tanggal 25 atau untuk bulan yang sudah lewat. */}
        {metode?.metode === "kakeibo" && tanyaLangsung && (bulan < bulanIni || Number(isoLokal(new Date()).slice(8)) >= 25) && (
          <button
            type="button"
            className={`${s.tombol} ${s.tombolSekunder}`}
            disabled={tanyaLangsung.sibuk}
            onClick={() => tanyaLangsung.kirim(`Refleksi Kakeibo ${label}`)}
          >
            Refleksi {label}
          </button>
        )}
      </div>
      {/* Tanya AI (SPEC-cerita-tanya): obrolannya di kerangka aplikasi, memakai bulan yang dipilih di sini. */}
      <TombolTanya />
    </>
  );
}
