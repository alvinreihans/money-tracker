"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCatat, useKategori } from "@/components/Catat";
import { LAYAR_LEBAR } from "@/components/navigasi";
import { tandaTransaksi } from "@/components/kategori";
import { judulTransaksi, namaKategori } from "@/lib/kategori";
import s from "@/components/ui.module.css";
import { alamatDetail, fmtIDR, fmtIDRRingkas, fmtTanggal, geserHari, isoLokal, kelompokWaktu, namaBulan } from "@/lib/format";
import { fmtJam } from "@/lib/waktu";
import { susunKartu, type InfoPecahan, type KartuRiwayat } from "@/lib/riwayat";
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

function Kartu({
  kartu: { t: wakil, baris, nominal, penuh },
  tanggal,
  kembali,
  terpilih,
  onPilih,
  pecahan,
}: { kartu: KartuRiwayat; tanggal: string | null; kembali?: string; pecahan?: InfoPecahan[string] } & Pilih) {
  const kategori = useKategori();
  const router = useRouter();
  // Satu bagian saja yang cocok filter: kartu tampil sebagai bagian itu (kategori & keterangannya).
  const t = baris.length === 1 ? baris[0] : wakil;
  const { ikon: Ikon, warna } = tandaTransaksi(t, kategori);
  // Di luar Riwayat (mis. Beranda), layar lebar membuka detail di dua panel
  // Riwayat, bukan halaman detail sendiri (SPEC-layar-lebar).
  const keDuaPanel = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !window.matchMedia(LAYAR_LEBAR).matches) return;
    e.preventDefault();
    router.push(`/riwayat?id=${t.pecahan_dari ?? t.id}`);
  };
  const { kantong } = useCatat();
  const tujuan = t.type === "transfer" ? kantong.find((k) => k.id === t.kantong_tujuan_id)?.name : undefined;
  const lewat = tujuan ? `${t.payment_method ?? "?"} → ${tujuan}` : t.payment_method;
  // Pindah kantong tidak berkategori; arahnya sudah cukup.
  // Transaksi yang dipecah (SPEC-metode-budget) tampil satu kartu yang
  // membuka transaksi aslinya. Semua bagian tampil: total & "N bagian".
  // Hanya sebagian yang cocok filter: jumlah bagian itu saja, dengan tanda
  // "Bagian dari Rp X" — sama dengan yang dihitung total hari/bulan.
  const sebagian = Boolean(pecahan) && !penuh;
  const { judul, dariKategori } = judulTransaksi(t, kategori);
  const rincian = [
    tanggal,
    t.type === "transfer" ? null : penuh ? `${baris.length} bagian` : baris.length > 1 ? `${baris.length} dari ${pecahan?.jumlah ?? "?"} bagian` : dariKategori ? null : namaKategori(kategori, t.category, t.type),
    lewat,
  ]
    .filter(Boolean)
    .join(" · ");
  const id = t.pecahan_dari ?? t.id;
  // Terpilih bila detail yang terbuka transaksi ini, lewat id asli maupun salah satu bagiannya.
  const dipilih = Boolean(terpilih) && (terpilih === id || baris.some((b) => b.id === terpilih));
  const keterangan = baris.length === 1 || penuh ? t.description : null;

  return (
    <NextLink
      href={alamatDetail(id, kembali)}
      className={`${s.kartuTx} ${s.tekan}`}
      aria-current={dipilih || undefined}
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
          <span className={s.barisJudul}>{judul}</span>
          <span className={s.redup}>{rincian}</span>
          {t.status === "needs_review" && <span className={`${s.lencana} ${s.lencanaBahaya}`}>Belum selesai</span>}
          {sebagian && <span className={s.redup}>Bagian dari {fmtIDR(pecahan!.total)}</span>}
        </span>
        <span className={`${s.nominal} ${kelasNominal(t)}`}>
          {t.type === "income" ? "+" : ""}
          {fmtIDR(nominal)}
        </span>
      </span>
      {keterangan && <span className={s.kartuCatatan} style={{ display: "block" }}>{keterangan}</span>}
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
  pecahan = {},
  totalKelompok,
}: Pilih & {
  /** Beranda: total pengeluaran sebenarnya per kelompok waktu ("Hari ini", …), dihitung server. */
  totalKelompok?: Record<string, number>;
  /** Transaksi yang dipecah: total & jumlah bagian per id aslinya (infoPecahan). */
  pecahan?: InfoPecahan;
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

  // Satu kartu per transaksi; bagian pecahan ikut kartu aslinya (susunKartu).
  const tampil = susunKartu(items, pecahan);

  // Data sudah terurut menurut tanggal dari query, jadi cukup dipecah urut.
  const kelompok: { kunci: string; isi: KartuRiwayat[] }[] = [];
  for (const c of tampil) {
    const k = kunci(c.t.transaction_date);
    const akhir = kelompok[kelompok.length - 1];
    if (akhir?.kunci === k) akhir.isi.push(c);
    else kelompok.push({ kunci: k, isi: [c] });
  }

  return (
    <>
      {kelompok.map((k, i) => {
        // Total dari server bila ada (Riwayat: per bulan; Beranda: per
        // kelompok waktu), selain itu dari kartu yang tampil. Draft belum
        // punya nominal yang benar; pindah kantong bukan pengeluaran.
        const total = perBulan?.[k.kunci] ?? {
          keluar:
            totalKelompok?.[k.kunci] ??
            k.isi.filter((c) => c.t.type === "expense" && c.t.status === "confirmed").reduce((n, c) => n + c.nominal, 0),
          masuk: 0,
        };
        const nilai = teksTotal(total);
        // Di dalam bulan: dipecah per hari (data sudah urut tanggal).
        const hari: { iso: string; isi: KartuRiwayat[] }[] = [];
        if (perBulan) {
          for (const c of k.isi) {
            const akhir = hari[hari.length - 1];
            if (akhir?.iso === c.t.transaction_date) akhir.isi.push(c);
            else hari.push({ iso: c.t.transaction_date, isi: [c] });
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
                      {h.isi.map((c) => (
                        <Kartu key={c.t.id} kartu={c} tanggal={tanggal(c.t, k.kunci)} kembali={kembali} terpilih={terpilih} onPilih={onPilih} pecahan={pecahan[c.t.pecahan_dari ?? c.t.id]} />
                      ))}
                    </div>
                  );
                })
              : k.isi.map((c) => (
                  <Kartu key={c.t.id} kartu={c} tanggal={tanggal(c.t, k.kunci)} kembali={kembali} terpilih={terpilih} onPilih={onPilih} pecahan={pecahan[c.t.pecahan_dari ?? c.t.id]} />
                ))}
          </section>
        );
      })}
      {kaki}
    </>
  );
}
