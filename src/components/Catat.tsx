"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus } from "lucide-react";
import LembarCatat, { type PerintahCatat } from "@/components/Obrolan";
import ImporRekening from "@/components/ImporRekening";
import KartuCalonPindah, { KUNCI_PERIKSA_PINDAH, muatCalon, urungkanPindah, type DataCalon } from "@/components/CalonPindah";
import { GalatForm, Lembar, Pesan, Spinner, useGalat } from "@/components/oneui";
import TransactionFields, { nilaiAwal, type NilaiTransaksi } from "@/components/TransactionFields";
import s from "@/components/ui.module.css";
import type { Kantong } from "@/lib/kantong";
import { namaKategori, type Kategori } from "@/lib/kategori";
import { MAKS_GAMBAR, useAntreanStruk, type ItemStruk } from "@/components/UploadReceiptForm";
import RingkasanUnggah, { teksRingkasan } from "@/components/RingkasanUnggah";
import { alamatDetail, fmtIDR } from "@/lib/format";
import { validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Pintu mencatat. Tombol "+" di tengah navigasi bawah membuka lembar Catat
 * (components/Obrolan.tsx): kolom ketik yang langsung siap diketik, dengan
 * kamera, galeri, dan form isian sebagai pintasan. Kalau ada yang kurang, AI
 * bertanya di tempat — catatan yang belum selesai menunggu di "Belum
 * selesai" (docs/specs/SPEC-catat-chat.md).
 *
 * Provider ini ditaruh di kerangka aplikasi, jadi antrean struk dari
 * "Bagikan" bertahan saat pindah halaman.
 */

interface Kabar {
  teks: string;
  aksi?: { label: string; jalankan: () => void };
  /** Lama tampil (ms); bawaan 6 detik. */
  lama?: number;
}

/** Kantong yang dipilih di form: cukup id, nama, dan jenisnya. */
export type PilihanKantong = Pick<Kantong, "id" | "name" | "kind" | "emoji"> & Partial<Pick<Kantong, "saldo_per" | "saldo_sejak" | "induk_id" | "macam_simpanan">>;

const CatatContext = createContext<{
  /** Buka lembar Catat; `teks` mengisi kolom ketik (mis. teks yang dibagikan). */
  buka: (teks?: string) => void;
  /** Buka percakapan satu catatan yang belum selesai (kartu Beranda, push). */
  bukaDraft: (id: string) => void;
  /** Buka daftar catatan yang belum selesai. */
  bukaDaftar: () => void;
  /** Buka isian manual, opsional dengan isian awal (mis. Sisihkan/Pakai di tujuan tabungan). */
  bukaManual: (awal?: Partial<NilaiTransaksi>) => void;
  /** Proses gambar di latar (galeri banyak, seret-lepas, Bagikan): baru atau melengkapi (SPEC-lengkapi §7). */
  tambahStruk: (berkas: File[]) => void;
  /** PDF rekening koran (Catat, seret-lepas, Bagikan): buka pratinjau impor (SPEC-impor-rekening). */
  tambahRekening: (berkas: File[]) => void;
  /** Snackbar singkat (mis. "2 struk diproses di latar"), opsional dengan satu aksi. */
  kabari: (teks: string, aksi?: Kabar["aksi"]) => void;
  kantong: PilihanKantong[];
  /**
   * Kantong yang baru dibuat di tempat (obrolan, SPEC-kantong-sendiri A-1): langsung ada
   * di pilihan kantong obrolan & form, tanpa menunggu daftar dari server dimuat ulang.
   */
  tambahKantong: (k: PilihanKantong) => void;
  /**
   * Kantong uang yang baru dibuat: cari transaksi rekening koran lama yang tampaknya pindah
   * ke/dari situ, tawarkan "Jadikan pindah" (A-3). Ditampilkan begitu tidak ada lembar
   * Catat/impor/manual yang terbuka (snackbar Urungkan tidak tertutup dialog).
   */
  periksaPindah: (kantongIds: string[]) => void;
  kategori: Kategori[];
  /** Email yang sedang masuk, untuk tab Profil. */
  email: string | null;
  /** Jumlah catatan yang belum selesai. */
  jumlahDraft: number;
} | null>(null);

/** Membuka lembar Catat dari mana saja, mis. dari halaman kosong. */
export function useCatat() {
  const api = useContext(CatatContext);
  if (!api) throw new Error("useCatat dipakai di luar CatatProvider");
  return api;
}

/** Kategori milik user (urut), untuk form dan tampilan. */
export function useKategori() {
  return useCatat().kategori;
}

/** Tombol + di tengah kapsul navigasi bawah; titik oranye = ada yang belum selesai. */
export function TombolCatat() {
  const { buka, jumlahDraft } = useCatat();
  return (
    <button type="button" className={s.navCatat} style={{ position: "relative" }} aria-label="Catat transaksi" onClick={() => buka()}>
      <Plus size={28} />
      <span className={s.navCatatLabel}>Catat transaksi</span>
      {jumlahDraft > 0 && (
        <span className={s.navTitik} style={{ top: 6, right: 6 }} aria-label={`${jumlahDraft} catatan belum selesai`} role="img" />
      )}
    </button>
  );
}

export function CatatProvider({
  saran,
  kantong,
  kategori,
  email,
  jumlahDraft,
  children,
}: {
  saran: string[];
  kantong: PilihanKantong[];
  kategori: Kategori[];
  email: string | null;
  jumlahDraft: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const antrean = useAntreanStruk();
  const [perintah, setPerintah] = useState<PerintahCatat | null>(null);
  // Isian manual yang terbuka beserta isian awalnya; null = tertutup.
  const [manual, setManual] = useState<Partial<NilaiTransaksi> | null>(null);
  const [kabar, setKabar] = useState<Kabar | null>(null);
  // PDF rekening koran yang sedang dipratinjau; null = tertutup.
  const [rekening, setRekening] = useState<File[] | null>(null);
  // Hasil unggah banyak terakhir (SPEC-lengkapi §7); lembarnya terbuka bila `lihatRingkasan`.
  const [ringkasan, setRingkasan] = useState<ItemStruk[] | null>(null);
  const [lihatRingkasan, setLihatRingkasan] = useState(false);
  const urut = useRef(0);
  // Kantong yang dibuat di tempat sejak halaman dimuat (A-1); yang sudah ada di daftar server dilewati.
  const [tambahan, setTambahan] = useState<PilihanKantong[]>([]);
  const semuaKantong = [...kantong, ...tambahan.filter((t) => !kantong.some((k) => k.id === t.id))];
  // Antrean kantong yang diperiksa calon pindahnya (A-3) dan kartu yang sedang tampil.
  const [antreanPindah, setAntreanPindah] = useState<string[]>([]);
  const [calon, setCalon] = useState<DataCalon | null>(null);
  const memeriksa = useRef(false);

  const bukaLembar = (p: Omit<PerintahCatat, "id">) => setPerintah({ ...p, id: ++urut.current });

  // Snackbar hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (!kabar) return;
    const t = setTimeout(() => setKabar(null), kabar.lama ?? 6000);
    return () => clearTimeout(t);
  }, [kabar]);

  // Struk dari "Bagikan" selesai diproses: kabari hasilnya.
  const tadiJalan = useRef(false);
  useEffect(() => {
    if (antrean.berjalan) {
      tadiJalan.current = true;
      return;
    }
    if (!tadiJalan.current) return;
    tadiJalan.current = false;
    // Ringkasan, bukan satu kartu per gambar (SPEC-lengkapi §7).
    const hasil = antrean.items;
    setRingkasan(hasil);
    setKabar({
      teks: teksRingkasan(hasil),
      aksi: { label: "Lihat", jalankan: () => setLihatRingkasan(true) },
      lama: 20000,
    });
    antrean.bersihkan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [antrean.berjalan]);

  // Seret foto struk ke mana saja di aplikasi (desktop, layar terpisah di
  // tablet/Fold — SPEC-layar-lebar): diproses di latar seperti dari "Bagikan".
  const [seret, setSeret] = useState(false);
  const lapisSeret = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let masukKe = 0; // dragenter/leave juga terpicu tiap pindah elemen anak
    const berkas = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));
    const masuk = (e: DragEvent) => {
      if (!berkas(e)) return;
      masukKe++;
      setSeret(true);
    };
    const lewat = (e: DragEvent) => berkas(e) && e.preventDefault(); // tanpa ini, drop tidak terjadi
    const keluar = (e: DragEvent) => {
      if (berkas(e) && --masukKe <= 0) setSeret(false);
    };
    const lepas = (e: DragEvent) => {
      if (!berkas(e)) return;
      e.preventDefault();
      masukKe = 0;
      setSeret(false);
      const semua = [...(e.dataTransfer?.files ?? [])];
      const gambar = semua.filter((f) => f.type.startsWith("image/"));
      const pdf = semua.filter(adalahPdf);
      if (gambar.length) tambahStruk(gambar);
      if (pdf.length) setRekening(pdf);
      if (!gambar.length && !pdf.length) setKabar({ teks: "Yang bisa dicatat cuma foto struk (gambar) atau PDF rekening koran." });
    };
    window.addEventListener("dragenter", masuk);
    window.addEventListener("dragover", lewat);
    window.addEventListener("dragleave", keluar);
    window.addEventListener("drop", lepas);
    return () => {
      window.removeEventListener("dragenter", masuk);
      window.removeEventListener("dragover", lewat);
      window.removeEventListener("dragleave", keluar);
      window.removeEventListener("drop", lepas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Popover: tampil di atas dialog yang sedang terbuka juga (top layer).
  useEffect(() => {
    const el = lapisSeret.current;
    if (!el) return;
    if (seret) el.showPopover();
    else if (el.matches(":popover-open")) el.hidePopover();
  }, [seret]);

  // Kantong dari layar awal (sessionStorage, MulaiView): diperiksa sekali saat aplikasi terbuka.
  useEffect(() => {
    try {
      const ids = JSON.parse(sessionStorage.getItem(KUNCI_PERIKSA_PINDAH) ?? "[]") as unknown;
      sessionStorage.removeItem(KUNCI_PERIKSA_PINDAH);
      // Aksi tertunda dari layar awal, bukan state turunan.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(ids) && ids.length) setAntreanPindah(ids.filter((x): x is string => typeof x === "string"));
    } catch {
      // Penyimpanan diblokir: penautan ulang dilewati, tidak apa-apa.
    }
  }, []);

  // Calon pindah satu per satu, hanya bila tidak ada lembar lain yang terbuka.
  const adaLembar = Boolean(perintah || rekening || manual || lihatRingkasan);
  useEffect(() => {
    if (adaLembar || calon || memeriksa.current || !antreanPindah.length) return;
    const [id, ...sisa] = antreanPindah;
    memeriksa.current = true;
    void muatCalon(id).then((d) => {
      memeriksa.current = false;
      setAntreanPindah(sisa);
      if (d) setCalon(d);
    });
  }, [adaLembar, calon, antreanPindah]);

  /** Gambar ke antrean; yang lewat batas K3 dikabari. */
  function tambahStruk(berkas: File[]) {
    const lebih = antrean.tambah(berkas);
    if (lebih) setKabar({ teks: `Maksimal ${MAKS_GAMBAR} gambar sekaligus — ${lebih} gambar belum diproses. Kirim lagi sesudah ini selesai.` });
  }

  function tersimpan(tx: Transaction) {
    setManual(null);
    setKabar({
      teks: `Tercatat: ${tx.merchant ?? namaKategori(kategori, tx.category, tx.type)} ${fmtIDR(Number(tx.amount))}`,
      aksi: { label: "Lihat", jalankan: () => router.push(alamatDetail(tx.id, window.location.pathname + window.location.search)) },
    });
    router.refresh();
  }

  return (
    <CatatContext.Provider
      value={{
        buka: (teks) => bukaLembar({ besar: false, layar: "obrolan", teks: typeof teks === "string" ? teks : "" }),
        bukaDraft: (id) => bukaLembar({ besar: true, layar: "obrolan", draft: id }),
        bukaDaftar: () => bukaLembar({ besar: true, layar: "daftar" }),
        bukaManual: (awal) => setManual(awal ?? {}),
        tambahStruk,
        tambahRekening: (berkas) => {
          if (berkas.length) setRekening(berkas);
        },
        kabari: (teks, aksi) => setKabar({ teks, aksi }),
        kantong: semuaKantong,
        tambahKantong: (k) => setTambahan((x) => [...x.filter((y) => y.id !== k.id), k]),
        periksaPindah: (ids) => setAntreanPindah((x) => [...x, ...ids.filter((id) => !x.includes(id))]),
        kategori,
        email,
        jumlahDraft,
      }}
    >
      {children}

      <div className={s.lapisBawah}>
        {antrean.berjalan && (
          <div className={s.snackbar} role="status">
            <span className={s.spinner} aria-hidden style={{ flex: "none" }} />
            <span>Lagi proses struk · sisa {antrean.sisa}</span>
          </div>
        )}
        {kabar && (
          <div className={s.snackbar} role="status">
            <span>{kabar.teks}</span>
            {kabar.aksi && (
              <button
                type="button"
                onClick={() => {
                  setKabar(null);
                  kabar.aksi?.jalankan();
                }}
              >
                {kabar.aksi.label}
              </button>
            )}
          </div>
        )}
      </div>

      <div ref={lapisSeret} popover="manual" className={s.lapisSeret} aria-hidden>
        <ImagePlus size={40} />
        Lepas untuk mencatat struk atau rekening koran
      </div>

      {perintah && (
        <LembarCatat
          key={perintah.id}
          perintah={perintah}
          saran={saran}
          jumlahDraft={jumlahDraft}
          onClose={() => setPerintah(null)}
          onManual={() => {
            setPerintah(null);
            setManual({});
          }}
        />
      )}

      {lihatRingkasan && ringkasan && (
        <RingkasanUnggah
          items={ringkasan}
          onUbah={setRingkasan}
          onCek={() => {
            setLihatRingkasan(false);
            bukaLembar({ besar: true, layar: "daftar" });
          }}
          onClose={() => setLihatRingkasan(false)}
        />
      )}

      {manual && <ManualDialog awal={manual} onClose={() => setManual(null)} onTersimpan={tersimpan} />}

      {calon && (
        <KartuCalonPindah
          key={calon.kantong.id}
          data={calon}
          onTutup={() => setCalon(null)}
          onSelesai={(n, salinan) => {
            const nama = calon.kantong.name;
            setCalon(null);
            router.refresh();
            setKabar({
              teks: `${n} transaksi jadi pindah kantong ${nama}`,
              lama: 10000,
              aksi: {
                label: "Urungkan",
                jalankan: async () => {
                  const galat = await urungkanPindah(salinan);
                  setKabar({ teks: galat ?? "Pindah kantong diurungkan" });
                  router.refresh();
                },
              },
            });
          }}
        />
      )}

      {rekening && (
        <ImporRekening
          berkas={rekening}
          onClose={() => setRekening(null)}
          onSelesai={(teks) => {
            setRekening(null);
            setKabar({ teks, aksi: { label: "Riwayat", jalankan: () => router.push("/riwayat") } });
          }}
        />
      )}
    </CatatContext.Provider>
  );
}

/** PDF menurut jenis atau nama berkasnya (sebagian aplikasi bank tidak mengisi jenisnya). */
export const adalahPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

async function kirimJson(url: string, body: unknown) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; transaction?: Transaction };
    if (res.ok && data.transaction) return { ok: true as const, tx: data.transaction };
    return { ok: false as const, error: data.error ?? "Gagal nyimpen." };
  } catch {
    return { ok: false as const, error: "Koneksinya bermasalah." };
  }
}

function ManualDialog({
  awal,
  onClose,
  onTersimpan,
}: {
  awal: Partial<NilaiTransaksi>;
  onClose: () => void;
  onTersimpan: (tx: Transaction) => void;
}) {
  const { kantong, kategori } = useCatat();
  const [nilai, setNilai] = useState(() => ({ ...nilaiAwal(undefined, awal.type), ...awal }));
  const [loading, setLoading] = useState(false);
  const { galat, gagal, bersihkan } = useGalat(nilai);

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    // Dicek di sini dulu supaya pesan salahnya langsung muncul di bawah isian
    // yang salah; server tetap memeriksa ulang dengan fungsi yang sama.
    const cek = validasiTransaksi({ ...nilai }, { wajibKantong: kantong.length > 0, kategori });
    if (!cek.ok) return gagal(cek.error, cek.kolom);

    setLoading(true);
    bersihkan();
    const r = await kirimJson("/api/catat-manual", cek.data);
    setLoading(false);

    if (!r.ok) return gagal(r.error);
    onTersimpan(r.tx);
  }

  return (
    <Lembar
      judul={
        nilai.type === "income"
          ? "Catat pemasukan"
          : nilai.type === "transfer"
            ? "Catat pindah kantong"
            : "Catat pengeluaran"
      }
      posisi="penuh"
      isian={nilai}
      onClose={() => !loading && onClose()}
      pil={[
        { label: "Batal", batal: true, disabled: loading },
        { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
      ]}
    >
      <form onSubmit={simpan} className={s.form}>
        <GalatForm value={galat}>
          <TransactionFields nilai={nilai} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />
        </GalatForm>
        {galat && !galat.kolom && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}
        {/* Enter di kolom mana pun tetap menyimpan. */}
        <button type="submit" hidden />
      </form>
    </Lembar>
  );
}
