"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, Inbox, Search, SearchX, Shapes, Wallet, X } from "lucide-react";
import { useCatat, useKategori } from "@/components/Catat";
import { tandaKategori } from "@/components/kategori";
import { AppBar, Field, Kosong, Lembar, Spinner } from "@/components/oneui";
import TransactionList from "@/components/TransactionList";
import s from "@/components/ui.module.css";
import { fmtIDRRingkas, fmtTanggalPendek, isoLokal } from "@/lib/format";
import { emojiKantong } from "@/lib/kantong";
import { kategoriJenis, namaKategori } from "@/lib/kategori";
import {
  adaFilter,
  alamatRiwayat,
  FILTER_KOSONG,
  PER_MUAT,
  PERIODE,
  queryRiwayat,
  type FilterRiwayat,
  type JenisRiwayat,
  type RingkasanRiwayat,
} from "@/lib/riwayat";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types/transaction";

const JENIS: { id: JenisRiwayat; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "keluar", label: "Keluar" },
  { id: "masuk", label: "Masuk" },
  { id: "pindah", label: "Pindah kantong" },
];

/** Baris pilihan di lembar filter: bulatan centang di kanan, pola daftar pilihan One UI. */
function BarisPilih({
  dipilih,
  peran,
  onClick,
  children,
}: {
  dipilih: boolean;
  peran: "checkbox" | "radio";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" role={peran} aria-checked={dipilih} className={`${s.baris} ${s.tekan} ${s.barisPilih}`} onClick={onClick}>
      {children}
      <span className={s.centang} data-aktif={dipilih} aria-hidden>
        {dipilih && <Check size={16} strokeWidth={3} />}
      </span>
    </button>
  );
}

/**
 * Riwayat dengan filter tanggal, kantong, dan kategori (SPEC-riwayat-filter).
 * Semua filter tinggal di URL; daftar dan totalnya dari server untuk seluruh
 * hasil filter.
 */
export default function RiwayatView({
  filter,
  total,
  ringkasan,
  daftar,
}: {
  filter: FilterRiwayat;
  /** Jumlah transaksi sebenarnya untuk filter ini. */
  total: number;
  /** Total keluar & masuk seluruh hasil filter, juga per bulan. */
  ringkasan: RingkasanRiwayat;
  /** 100 pertama dari server. */
  daftar: Transaction[];
}) {
  const router = useRouter();
  const { kantong } = useCatat();
  const kategori = useKategori();
  const { q } = filter;
  const ke = (perubahan: Partial<FilterRiwayat>) => alamatRiwayat({ ...filter, ...perubahan });

  // "Muat lagi" mengambil 100 berikutnya langsung dari browser dan
  // menyambungnya di bawah — tanpa pindah halaman, jadi posisi gulir tetap.
  const [lanjutan, setLanjutan] = useState<{ asal: Transaction[]; isi: Transaction[] }>({ asal: daftar, isi: [] });
  const [memuat, setMemuat] = useState(false);
  const [gagalMuat, setGagalMuat] = useState(false);
  // Data server baru (filter/cari ganti, atau refresh setelah simpan):
  // sambungan lama dibuang.
  const tambahan = lanjutan.asal === daftar ? lanjutan.isi : [];
  const semua = tambahan.length ? [...daftar, ...tambahan] : daftar;

  async function muatLagi() {
    setMemuat(true);
    setGagalMuat(false);
    const { data, error } = await queryRiwayat(createSupabaseBrowserClient(), filter, isoLokal(new Date())).range(
      semua.length,
      semua.length + PER_MUAT - 1,
    );
    setMemuat(false);
    if (error) return setGagalMuat(true);
    setLanjutan({ asal: daftar, isi: [...tambahan, ...((data ?? []) as unknown as Transaction[])] });
  }

  const [cariBuka, setCariBuka] = useState(Boolean(q));
  const [teks, setTeks] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fokus masih di dalam ketukan tombol cari, jadi keyboard HP langsung muncul.
  useLayoutEffect(() => {
    if (cariBuka) inputRef.current?.focus();
  }, [cariBuka]);

  // Cari otomatis sejenak setelah berhenti mengetik, tanpa tombol "Cari".
  useEffect(() => {
    if (teks.trim() === q) return;
    const t = setTimeout(() => router.replace(ke({ q: teks.trim() })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teks, q, router]);

  function tutupCari() {
    setTeks("");
    setCariBuka(false);
    if (q) router.replace(ke({ q: "" }));
  }

  // --- Lembar filter: pilihan sementara, baru berlaku saat "Terapkan". ---
  const [lembar, setLembar] = useState<"tanggal" | "kantong" | "kategori" | null>(null);
  const [draf, setDraf] = useState<FilterRiwayat>(filter);
  const [rentangSendiri, setRentangSendiri] = useState(false);
  function buka(jenis: "tanggal" | "kantong" | "kategori") {
    setDraf(filter);
    setRentangSendiri(!filter.periode && Boolean(filter.dari || filter.sampai));
    setLembar(jenis);
  }
  function terapkan(perubahan: Partial<FilterRiwayat>) {
    setLembar(null);
    router.push(ke(perubahan));
  }
  const pilihGanda = (kolom: "kantong" | "kategori", nilai: string) =>
    setDraf((d) => ({ ...d, [kolom]: d[kolom].includes(nilai) ? d[kolom].filter((x) => x !== nilai) : [...d[kolom], nilai] }));

  // --- Label chip: nilai yang aktif, bukan sekadar nama filternya. ---
  const ringkasNama = (nama: string[], kosong: string) => (nama.length === 0 ? kosong : nama.length === 1 ? nama[0] : `${nama[0]} +${nama.length - 1}`);
  const labelTanggal = filter.periode
    ? PERIODE.find((p) => p.id === filter.periode)!.label
    : filter.dari || filter.sampai
      ? [filter.dari && fmtTanggalPendek(filter.dari), filter.sampai && fmtTanggalPendek(filter.sampai)].map((x) => x || "…").join(" – ")
      : "Tanggal";
  const labelKantong = ringkasNama(
    filter.kantong.map((id) => kantong.find((k) => k.id === id)?.name ?? "?"),
    "Kantong",
  );
  const labelKategori = ringkasNama(
    filter.kategori.map((v) => {
      const [type, slug] = v.split(":");
      return namaKategori(kategori, slug, type as "expense" | "income");
    }),
    "Kategori",
  );
  const aktif = adaFilter(filter);

  const ringkas = [
    q ? `${total} hasil untuk “${q}”` : `${total} transaksi`,
    ringkasan.keluar > 0 && `keluar ${fmtIDRRingkas(ringkasan.keluar)}`,
    ringkasan.masuk > 0 && `masuk ${fmtIDRRingkas(ringkasan.masuk)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const pilHapusTerapkan = (hapus: Partial<FilterRiwayat>, ambil: () => Partial<FilterRiwayat>) => [
    { label: "Hapus", onClick: () => terapkan(hapus) },
    { label: "Terapkan", onClick: () => terapkan(ambil()) },
  ];

  return (
    <>
      <AppBar
        judul="Riwayat"
        sub={ringkas}
        aksi={
          !cariBuka && (
            <button type="button" className={s.ikonTombol} aria-label="Cari transaksi" onClick={() => setCariBuka(true)}>
              <Search size={22} />
            </button>
          )
        }
      />

      <div className={s.isi}>
        {cariBuka && (
          <div className={s.cari} role="search">
            <Search size={20} aria-hidden />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              aria-label="Cari merchant, keterangan, atau metode bayar"
              placeholder="Cari merchant, keterangan…"
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && tutupCari()}
            />
            <button type="button" className={s.ikonTombol} aria-label="Tutup pencarian" onClick={tutupCari}>
              <X size={20} />
            </button>
          </div>
        )}

        {/* Satu baris yang bisa digeser: pilihan tidak muat di layar HP. */}
        <div className={s.chips} role="group" aria-label="Jenis transaksi">
          {JENIS.map((j) => (
            <button key={j.id} type="button" className={s.chip} aria-pressed={filter.jenis === j.id} onClick={() => router.push(ke({ jenis: j.id }))}>
              {j.label}
            </button>
          ))}
        </div>

        {/* Filter lain: chip berisi nilainya, ketuk → lembar pilihan. */}
        <div className={s.chips} role="group" aria-label="Saring transaksi" style={{ marginTop: -4 }}>
          <button type="button" className={s.chip} aria-pressed={Boolean(filter.periode || filter.dari || filter.sampai)} aria-haspopup="dialog" onClick={() => buka("tanggal")}>
            <CalendarDays size={16} aria-hidden /> {labelTanggal} <ChevronDown size={16} aria-hidden />
          </button>
          <button type="button" className={s.chip} aria-pressed={filter.kantong.length > 0} aria-haspopup="dialog" onClick={() => buka("kantong")}>
            <Wallet size={16} aria-hidden /> {labelKantong} <ChevronDown size={16} aria-hidden />
          </button>
          <button type="button" className={s.chip} aria-pressed={filter.kategori.length > 0} aria-haspopup="dialog" onClick={() => buka("kategori")}>
            <Shapes size={16} aria-hidden /> {labelKategori} <ChevronDown size={16} aria-hidden />
          </button>
          {aktif && (
            <button type="button" className={s.chip} onClick={() => router.push(alamatRiwayat({ ...FILTER_KOSONG, jenis: filter.jenis, q }))}>
              <X size={16} aria-hidden /> Reset
            </button>
          )}
        </div>

        {daftar.length > 0 ? (
          <TransactionList
            items={semua}
            kembali={alamatRiwayat(filter)}
            perBulan={ringkasan.perBulan}
            perHari={ringkasan.perHari}
            kaki={
              semua.length < total && (
                <button
                  type="button"
                  className={`${s.kartuTx} ${s.kartuKaki} ${s.tekan}`}
                  style={{ width: "100%", border: 0, cursor: "pointer" }}
                  disabled={memuat}
                  onClick={() => void muatLagi()}
                >
                  {memuat ? (
                    <Spinner label="Memuat…" />
                  ) : gagalMuat ? (
                    "Gagal memuat. Ketuk untuk coba lagi"
                  ) : (
                    `Muat lagi · ${total - semua.length} transaksi lebih lama`
                  )}
                </button>
              )
            }
          />
        ) : (
          <div className={s.blok}>
            {q ? (
              <Kosong ikon={SearchX} judul={`Nggak ketemu “${q}”`}>
                Coba kata lain, atau cek filter yang aktif.
              </Kosong>
            ) : aktif || filter.jenis !== "semua" ? (
              <Kosong ikon={Inbox} judul="Tidak ada transaksi untuk filter ini">
                <button type="button" className={s.tombol} style={{ marginTop: 16 }} onClick={() => router.push("/riwayat")}>
                  Hapus filter
                </button>
              </Kosong>
            ) : (
              <Kosong ikon={Inbox} judul="Belum ada transaksi di sini" />
            )}
          </div>
        )}
      </div>

      {lembar === "tanggal" && (
        <Lembar
          judul="Tanggal"
          daftar
          onClose={() => setLembar(null)}
          pil={pilHapusTerapkan({ periode: null, dari: null, sampai: null }, () =>
            rentangSendiri ? { periode: null, dari: draf.dari, sampai: draf.sampai } : { periode: draf.periode, dari: null, sampai: null },
          )}
        >
          <div role="radiogroup" aria-label="Periode">
            <BarisPilih peran="radio" dipilih={!rentangSendiri && !draf.periode} onClick={() => (setRentangSendiri(false), setDraf((d) => ({ ...d, periode: null })))}>
              <span className={s.barisJudul}>Semua waktu</span>
            </BarisPilih>
            {PERIODE.map((p) => (
              <BarisPilih key={p.id} peran="radio" dipilih={!rentangSendiri && draf.periode === p.id} onClick={() => (setRentangSendiri(false), setDraf((d) => ({ ...d, periode: p.id })))}>
                <span className={s.barisJudul}>{p.label}</span>
              </BarisPilih>
            ))}
            <BarisPilih peran="radio" dipilih={rentangSendiri} onClick={() => (setRentangSendiri(true), setDraf((d) => ({ ...d, periode: null })))}>
              <span className={s.barisJudul}>Pilih rentang</span>
            </BarisPilih>
          </div>
          {rentangSendiri && (
            <div className={`${s.blokForm}`} style={{ padding: "0 4px 8px" }}>
              {/* Isian tanggal bawaan: di HP muncul kalender sistem. */}
              <Field label="Dari" ikon={CalendarDays}>
                <input type="date" value={draf.dari ?? ""} onChange={(e) => setDraf((d) => ({ ...d, dari: e.target.value || null }))} />
              </Field>
              <Field label="Sampai" ikon={CalendarDays}>
                <input type="date" value={draf.sampai ?? ""} onChange={(e) => setDraf((d) => ({ ...d, sampai: e.target.value || null }))} />
              </Field>
            </div>
          )}
        </Lembar>
      )}

      {lembar === "kantong" && (
        <Lembar judul="Kantong" sub="Transaksi dari atau ke kantong ini." daftar onClose={() => setLembar(null)} pil={pilHapusTerapkan({ kantong: [] }, () => ({ kantong: draf.kantong }))}>
          {kantong.map((k) => (
            <BarisPilih key={k.id} peran="checkbox" dipilih={draf.kantong.includes(k.id)} onClick={() => pilihGanda("kantong", k.id)}>
              <span className={s.barisEmoji} aria-hidden>
                {emojiKantong(k)}
              </span>
              <span className={s.barisJudul}>{k.name}</span>
            </BarisPilih>
          ))}
        </Lembar>
      )}

      {lembar === "kategori" && (
        <Lembar judul="Kategori" daftar onClose={() => setLembar(null)} pil={pilHapusTerapkan({ kategori: [] }, () => ({ kategori: draf.kategori }))}>
          {(["expense", "income"] as const).map((jenis) => (
            <div key={jenis} role="group" aria-label={jenis === "expense" ? "Pengeluaran" : "Pemasukan"}>
              <h3 className={s.subheader}>{jenis === "expense" ? "Pengeluaran" : "Pemasukan"}</h3>
              {kategoriJenis(kategori, jenis).map((k) => {
                const { ikon: Ikon, warna } = tandaKategori(k);
                const nilai = `${jenis}:${k.slug}`;
                return (
                  <BarisPilih key={nilai} peran="checkbox" dipilih={draf.kategori.includes(nilai)} onClick={() => pilihGanda("kategori", nilai)}>
                    <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
                      <Ikon size={20} />
                    </span>
                    <span className={s.barisJudul}>{k.name}</span>
                  </BarisPilih>
                );
              })}
            </div>
          ))}
        </Lembar>
      )}
    </>
  );
}
