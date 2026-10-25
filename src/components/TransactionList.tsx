"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCatat, useKategori } from "@/components/Catat";
import { LAYAR_LEBAR } from "@/components/navigasi";
import { tandaTransaksi } from "@/components/kategori";
import { namaKategori } from "@/lib/kategori";
import s from "@/components/ui.module.css";
import { alamatDetail, fmtIDR, fmtIDRRingkas, fmtTanggal, geserHari, isoLokal, kelompokWaktu, namaBulan } from "@/lib/format";
import { fmtJam } from "@/lib/waktu";
import type { Transaction } from "@/types/transaction";

/**
 * Daftar transaksi ala Voice Recorder Samsung: satu transaksi satu kartu,
 * dikelompokkan dengan subheader waktu yang makin kasar ke belakang ("Hari
 * ini", "Kemarin", "Minggu ini", nama bulan, tahun). Keterangan transaksi
 * tampil di bawah garis putus-putus di dalam kartunya, seperti ringkasan
 * rekaman.
 *
 * Subheader membawa total pengeluaran kelompoknya — pertanyaan paling umum
 * saat membuka riwayat adalah "kemarin habis berapa".
 *
 * Dengan `perBulan` (Riwayat, SPEC-riwayat-filter): dikelompokkan per bulan,
 * lalu per hari di dalamnya ("Senin, 20 Okt"), masing-masing dengan total
 * keluar & masuk untuk SELURUH hasil filter (dihitung server), bukan hanya
 * baris yang sudah termuat. Tiap kartu cukup menampilkan jamnya.
 */

/**
 * Pengeluaran sengaja memakai warna teks biasa, bukan merah: belanja bukan
 * kesalahan, dan mewarnai semuanya merah membuat penanda yang sungguhan
 * penting — draft yang salah baca — jadi tidak terlihat.
 */
function kelasNominal(t: Transaction): string {
  if (t.status === "needs_review") return s.bahaya;
  if (t.type === "income") return s.masuk;
  if (t.type === "transfer") return s.pindah;
  return "";
}

type Pilih = { terpilih?: string | null; onPilih?: (e: React.MouseEvent, t: Transaction) => void };

function Kartu({ t, tanggal, kembali, terpilih, onPilih }: { t: Transaction; tanggal: string | null; kembali?: string } & Pilih) {
  const kategori = useKategori();
  const router = useRouter();
  const { ikon: Ikon, warna } = tandaTransaksi(t, kategori);
  // Di luar Riwayat (mis. Beranda), layar lebar membuka detail di dua panel
  // Riwayat, bukan halaman detail sendiri (SPEC-layar-lebar).
  const keDuaPanel = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !window.matchMedia(LAYAR_LEBAR).matches) return;
    e.preventDefault();
    router.push(`/riwayat?id=${t.id}`);
  };
  const { kantong } = useCatat();
  const tujuan = t.type === "transfer" ? kantong.find((k) => k.id === t.kantong_tujuan_id)?.name : undefined;
  const lewat = tujuan ? `${t.payment_method ?? "?"} → ${tujuan}` : t.payment_method;
  // Pindah kantong tidak berkategori; arahnya sudah cukup.
  const rincian = [tanggal, t.type === "transfer" ? null : namaKategori(kategori, t.category, t.type), lewat].filter(Boolean).join(" · ");

  return (
    <NextLink
      href={alamatDetail(t.id, kembali)}
      className={`${s.kartuTx} ${s.tekan}`}
      aria-current={terpilih === t.id || undefined}
      onClick={onPilih ? (e) => onPilih(e, t) : keDuaPanel}
    >
      <span className={s.baris}>
        <span
          className={s.barisIkon}
          // Wadah diwarnai tipis, ikonnya warna penuh: tetap tenang di layar gelap.
          style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }}
          aria-hidden
        >
          <Ikon size={20} />
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul}>{t.merchant ?? "Tanpa nama"}</span>
          <span className={s.redup}>{rincian}</span>
          {t.status === "needs_review" && <span className={`${s.lencana} ${s.lencanaBahaya}`}>Belum selesai</span>}
        </span>
        <span className={`${s.nominal} ${kelasNominal(t)}`}>
          {t.type === "income" ? "+" : ""}
          {fmtIDR(Number(t.amount))}
        </span>
      </span>
      {t.description && <span className={s.kartuCatatan} style={{ display: "block" }}>{t.description}</span>}
    </NextLink>
  );
}

export default function TransactionList({
  items,
  kaki,
  kembali,
  perBulan,
  perHari,
  terpilih,
  onPilih,
}: Pilih & {
  items: Transaction[];
  /** Aksi penutup di bawah daftar, mis. "Lihat semua riwayat". */
  kaki?: React.ReactNode;
  /** Alamat halaman ini, tujuan kembali dari detail (lihat alamatDetail). */
  kembali?: string;
  /** "YYYY-MM" → total keluar & masuk seluruh hasil: kelompok per bulan. */
  perBulan?: Record<string, { keluar: number; masuk: number }>;
  /** "YYYY-MM-DD" → total hari itu, untuk subheader hari di dalam bulan. */
  perHari?: Record<string, { keluar: number; masuk: number }>;
}) {
  const hariIni = isoLokal(new Date());
  const kemarin = geserHari(hariIni, -1);
  const kunci = (iso: string) => (perBulan ? iso.slice(0, 7) : kelompokWaktu(iso));
  const label = (k: string) => {
    if (!perBulan) return k;
    const bulan = namaBulan(`${k}-01`);
    return `${bulan.charAt(0).toUpperCase()}${bulan.slice(1)} ${k.slice(0, 4)}`;
  };
  // Per bulan: tanggalnya ada di subheader hari, kartu cukup jamnya. Per
  // waktu: di "Hari ini"/"Kemarin" tanggalnya sudah jelas dari subheader.
  const tanggal = (t: Transaction, k: string) => {
    if (perBulan) return fmtJam(t.waktu);
    return k === "Hari ini" || k === "Kemarin" ? null : fmtTanggal(t.transaction_date);
  };
  const labelHari = (iso: string) =>
    iso === hariIni
      ? "Hari ini"
      : iso === kemarin
        ? "Kemarin"
        : new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const teksTotal = (t: { keluar: number; masuk: number }) =>
    [t.keluar > 0 && `−${fmtIDRRingkas(t.keluar)}`, t.masuk > 0 && `+${fmtIDRRingkas(t.masuk)}`].filter(Boolean).join(" · ");

  // Data sudah terurut menurut tanggal dari query, jadi cukup dipecah urut.
  const kelompok: { kunci: string; isi: Transaction[] }[] = [];
  for (const t of items) {
    const k = kunci(t.transaction_date);
    const akhir = kelompok[kelompok.length - 1];
    if (akhir?.kunci === k) akhir.isi.push(t);
    else kelompok.push({ kunci: k, isi: [t] });
  }

  return (
    <>
      {kelompok.map((k, i) => {
        // Draft belum punya nominal yang benar; pindah kantong bukan pengeluaran.
        const total = perBulan?.[k.kunci] ?? {
          keluar: k.isi.filter((t) => t.type === "expense" && t.status === "confirmed").reduce((n, t) => n + Number(t.amount), 0),
          masuk: 0,
        };
        const nilai = teksTotal(total);
        // Di dalam bulan: dipecah per hari (data sudah urut tanggal).
        const hari: { iso: string; isi: Transaction[] }[] = [];
        if (perBulan) {
          for (const t of k.isi) {
            const akhir = hari[hari.length - 1];
            if (akhir?.iso === t.transaction_date) akhir.isi.push(t);
            else hari.push({ iso: t.transaction_date, isi: [t] });
          }
        }

        return (
          <section key={`${k.kunci}-${i}`} className={s.kelompok}>
            <h2 className={`${s.subheader} ${s.subheaderTebal} ${s.subheaderBaris}`}>
              <span>{label(k.kunci)}</span>
              {nilai && (
                <>
                  <span className={s.titikTitik} aria-hidden />
                  <span className={`${s.subheaderNilai} ${s.redup}`}>{nilai}</span>
                </>
              )}
            </h2>
            {perBulan
              ? hari.map((h) => {
                  const nilaiHari = perHari?.[h.iso] ? teksTotal(perHari[h.iso]) : "";
                  return (
                    <div key={h.iso} className={s.kelompok}>
                      <h3 className={`${s.subheader} ${s.subheaderBaris}`}>
                        <span>{labelHari(h.iso)}</span>
                        {nilaiHari && (
                          <>
                            <span className={s.titikTitik} aria-hidden />
                            <span className={s.subheaderNilai}>{nilaiHari}</span>
                          </>
                        )}
                      </h3>
                      {h.isi.map((t) => (
                        <Kartu key={t.id} t={t} tanggal={tanggal(t, k.kunci)} kembali={kembali} terpilih={terpilih} onPilih={onPilih} />
                      ))}
                    </div>
                  );
                })
              : k.isi.map((t) => <Kartu key={t.id} t={t} tanggal={tanggal(t, k.kunci)} kembali={kembali} terpilih={terpilih} onPilih={onPilih} />)}
          </section>
        );
      })}
      {kaki}
    </>
  );
}
