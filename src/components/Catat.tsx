"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus } from "lucide-react";
import LembarCatat, { type PerintahCatat } from "@/components/Obrolan";
import { Lembar, Pesan, Spinner } from "@/components/oneui";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
import s from "@/components/ui.module.css";
import type { Kantong } from "@/lib/kantong";
import { namaKategori, type Kategori } from "@/lib/kategori";
import { useAntreanStruk } from "@/components/UploadReceiptForm";
import { alamatDetail, fmtIDR } from "@/lib/format";
import { validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Pintu mencatat. Tombol "+" di tengah navigasi bawah membuka lembar Catat
 * (components/Obrolan.tsx): kolom ketik yang langsung siap diketik, dengan
 * kamera, galeri, dan form isian sebagai pintasan. Kalau ada yang kurang, AI
 * bertanya di tempat — catatan yang belum selesai menunggu di "Belum
 * selesai" (SPEC-catat-chat.md).
 *
 * Provider ini ditaruh di kerangka aplikasi, jadi antrean struk dari
 * "Bagikan" bertahan saat pindah halaman.
 */

interface Kabar {
  teks: string;
  aksi?: { label: string; jalankan: () => void };
}

/** Kantong yang dipilih di form: cukup id, nama, dan jenisnya. */
export type PilihanKantong = Pick<Kantong, "id" | "name" | "kind" | "emoji"> & Partial<Pick<Kantong, "saldo_per" | "saldo_sejak">>;

const CatatContext = createContext<{
  /** Buka lembar Catat; `teks` mengisi kolom ketik (mis. teks yang dibagikan). */
  buka: (teks?: string) => void;
  /** Buka percakapan satu catatan yang belum selesai (kartu Beranda, push). */
  bukaDraft: (id: string) => void;
  /** Buka daftar catatan yang belum selesai. */
  bukaDaftar: () => void;
  /** Proses gambar dari "Bagikan" di latar, masing-masing jadi satu transaksi. */
  tambahStruk: (berkas: File[]) => void;
  /** Snackbar singkat (mis. "2 struk diproses di latar"), opsional dengan satu aksi. */
  kabari: (teks: string, aksi?: Kabar["aksi"]) => void;
  kantong: PilihanKantong[];
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
  const [manual, setManual] = useState(false);
  const [kabar, setKabar] = useState<Kabar | null>(null);
  const urut = useRef(0);

  const bukaLembar = (p: Omit<PerintahCatat, "id">) => setPerintah({ ...p, id: ++urut.current });

  // Snackbar hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (!kabar) return;
    const t = setTimeout(() => setKabar(null), 6000);
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
    const ok = antrean.items.filter((i) => i.status === "ok").length;
    const kurang = antrean.items.filter((i) => i.status === "draft").length;
    const gagal = antrean.items.filter((i) => i.status === "gagal").length;
    const bagian = [ok && `${ok} tercatat`, kurang && `${kurang} belum lengkap`, gagal && `${gagal} gagal`].filter(Boolean);
    setKabar({
      teks: bagian.join(" · ") || "Selesai",
      aksi: kurang ? { label: "Lengkapi", jalankan: () => bukaLembar({ besar: true, layar: "daftar" }) } : undefined,
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
      const gambar = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (gambar.length) antrean.tambah(gambar);
      else setKabar({ teks: "Yang bisa dicatat cuma foto struk (gambar)." });
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

  function tersimpan(tx: Transaction) {
    setManual(false);
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
        tambahStruk: antrean.tambah,
        kabari: (teks, aksi) => setKabar({ teks, aksi }),
        kantong,
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
        Lepas untuk mencatat struk
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
            setManual(true);
          }}
        />
      )}

      {manual && <ManualDialog onClose={() => setManual(false)} onTersimpan={tersimpan} />}
    </CatatContext.Provider>
  );
}

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

function ManualDialog({ onClose, onTersimpan }: { onClose: () => void; onTersimpan: (tx: Transaction) => void }) {
  const { kantong, kategori } = useCatat();
  const [nilai, setNilai] = useState(() => nilaiAwal());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    // Dicek di sini dulu supaya pesan salahnya langsung muncul; server tetap
    // memeriksa ulang dengan fungsi yang sama.
    const cek = validasiTransaksi({ ...nilai }, { wajibKantong: kantong.length > 0, kategori });
    if (!cek.ok) return setError(cek.error);

    setLoading(true);
    setError(null);
    const r = await kirimJson("/api/catat-manual", cek.data);
    setLoading(false);

    if (!r.ok) return setError(r.error);
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
        <TransactionFields nilai={nilai} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />
        {error && <Pesan jenis="bahaya">{error}</Pesan>}
        {/* Enter di kolom mana pun tetap menyimpan. */}
        <button type="submit" hidden />
      </form>
    </Lembar>
  );
}
