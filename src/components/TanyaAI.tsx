"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, History, SquarePen, Sparkles, Trash2 } from "lucide-react";
import { LAYAR_LEBAR } from "@/components/navigasi";
import { Lembar, Spinner } from "@/components/oneui";
import { kembalikanKategori, ubahKategoriMerchant, type HasilUbahKategori } from "@/components/TawaranSerupa";
import s from "@/components/ui.module.css";
import { fmtIDR, fmtTanggalPendek, isoLokal, namaBulan } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";
import { pengurai, TIPE_ALIR } from "@/lib/alir";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { HasilTanya, UsulanKategori } from "@/lib/tanya-server";
import type { UsulanAksi } from "@/lib/usulan";

/** Batas yang sama dengan server (SPEC-asisten-agen §5). */
const MAKS_PERTANYAAN = 1000;
const MAKS_RIWAYAT = 20;

/** Kartu usulan alat ubah beserta keadaannya (disimpan bersama obrolan, P4). */
interface KartuAksi {
  u: UsulanAksi;
  keadaan: "siap" | "diterapkan" | "diurungkan" | "batal";
  aksi_id?: string;
  /** Kalimat hasil terakhir, mis. "Saldo DANA sekarang Rp 200.000." — juga dikirim ke model di riwayat. */
  hasil?: string;
}

/** Keadaan kartu ubah kategori (SPEC-ingat-kategori), ikut disimpan. */
interface KeadaanKategori {
  keadaan: "siap" | "diubah" | "batal" | "dikembalikan";
  hasil?: HasilUbahKategori;
}

type PesanAI = {
  peran: "ai";
  teks: string;
  tautan: { label: string; href: string }[];
  ragu: boolean;
  usulan?: UsulanKategori;
  usulanKeadaan?: KeadaanKategori;
  kartu?: KartuAksi[];
  catatan?: string;
  lanjutkan?: boolean;
  /** Tidak ditampilkan (P8); lanjutan percakapan yang sudah naik tetap di model besar. */
  model?: "ringan" | "berat";
};
type Pesan = { peran: "saya"; teks: string } | PesanAI | { peran: "galat"; teks: string };

interface RingkasObrolan {
  id: string;
  judul: string;
  jumlah_pesan: number;
  diubah: string;
}

/** Ikon sparkle bergradasi (tombol melayang & layar kosong). Gradasinya didefinisikan sekali. */
export function IkonAI({ size = 26 }: { size?: number }) {
  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <linearGradient id="gradien-ai" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4fb3ff" />
            <stop offset="0.5" stopColor="#a66bff" />
            <stop offset="1" stopColor="#ff6bb5" />
          </linearGradient>
        </defs>
      </svg>
      <Sparkles size={size} stroke="url(#gradien-ai)" strokeWidth={2.2} aria-hidden />
    </>
  );
}

const Besar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Status kartu untuk riwayat yang dikirim ke model, supaya asisten tahu apa yang sudah diterapkan. */
function statusKartu(k: KartuAksi): string {
  const keadaan = k.keadaan === "diterapkan" ? "SUDAH diterapkan pengguna" : k.keadaan === "diurungkan" ? "diterapkan lalu diurungkan" : k.keadaan === "batal" ? "ditolak pengguna" : "belum diterapkan";
  return `[Kartu usulan "${k.u.judul}": ${keadaan}${k.hasil ? `. ${k.hasil}` : ""}]`;
}

/** Teks pesan untuk riwayat model: jawaban + status kartu-kartunya. */
const teksRiwayat = (p: Pesan) =>
  p.peran === "ai" && (p.kartu?.length || p.usulanKeadaan) ? [p.teks, ...(p.kartu ?? []).map(statusKartu), ...(p.usulan && p.usulanKeadaan?.keadaan === "diubah" ? [`[Kategori ${p.usulan.merchant} SUDAH diubah pengguna]`] : [])].join("\n") : p.teks;

const kalimatSaldo = (saldo: { nama: string; saldo: number }[]) => (saldo.length ? `Saldo ${saldo.map((x) => `${x.nama} sekarang ${fmtIDR(x.saldo)}`).join(", ")}.` : "");

/**
 * Kartu konfirmasi usulan Tanya AI (SPEC-ingat-kategori): AI hanya
 * mengusulkan; kategori baru berubah setelah user menekan Ubah, dan bisa
 * diurungkan. Server mencari ulang transaksinya saat Ubah ditekan.
 */
function KartuUsulan({ u, awal, simpan }: { u: UsulanKategori; awal?: KeadaanKategori; simpan: (k: KeadaanKategori) => void }) {
  const router = useRouter();
  const [keadaan, setKeadaan] = useState<KeadaanKategori["keadaan"] | "sibuk">(awal?.keadaan ?? "siap");
  const [hasil, setHasil] = useState<HasilUbahKategori | null>(awal?.hasil ?? null);
  const [error, setError] = useState<string | null>(null);
  const tujuan = u.kategori?.name ?? u.kategori_baru?.nama ?? "";

  async function ubah() {
    setKeadaan("sibuk");
    setError(null);
    const r = await ubahKategoriMerchant({ merchant: u.merchant, type: u.type, kategori: u.kategori?.slug, kategori_baru: u.kategori_baru, kelompok: null });
    if ("error" in r) {
      setError(r.error);
      return setKeadaan("siap");
    }
    setHasil(r);
    setKeadaan("diubah");
    simpan({ keadaan: "diubah", hasil: r });
    router.refresh();
  }

  async function urungkan() {
    if (!hasil) return;
    setKeadaan("sibuk");
    const err = await kembalikanKategori(hasil.sebelum);
    if (err) {
      setError("Gagal mengurungkan. Coba lagi.");
      return setKeadaan("diubah");
    }
    setKeadaan("dikembalikan");
    simpan({ keadaan: "dikembalikan" });
    router.refresh();
  }

  return (
    <div className={s.gptUsulan} role="group" aria-label="Usulan ubah kategori">
      {keadaan === "diubah" && hasil ? (
        <>
          <p>
            {hasil.diubah} transaksi {u.merchant} sekarang {hasil.kategori.name}. Transaksi berikutnya dari {u.merchant} otomatis {hasil.kategori.name}.
          </p>
          <div className={s.gptUsulanTombol}>
            <button type="button" className={s.flat} onClick={() => void urungkan()}>
              Urungkan
            </button>
          </div>
        </>
      ) : keadaan === "dikembalikan" ? (
        <p>Dikembalikan ke kategori semula.</p>
      ) : keadaan === "batal" ? (
        <p>Tidak jadi diubah.</p>
      ) : (
        <>
          <p>
            {u.kategori_baru ? `Buat kategori ${tujuan} dan ubah` : "Ubah"} {u.jumlah} transaksi {u.merchant} jadi {tujuan}?
          </p>
          <div className={s.gptUsulanTombol}>
            <button
              type="button"
              className={s.flat}
              disabled={keadaan === "sibuk"}
              onClick={() => {
                setKeadaan("batal");
                simpan({ keadaan: "batal" });
              }}
            >
              Batal
            </button>
            <button type="button" className={s.tombol} disabled={keadaan === "sibuk"} onClick={() => void ubah()}>
              {keadaan === "sibuk" ? <Spinner /> : "Ubah"}
            </button>
          </div>
        </>
      )}
      {error && (
        <small className={s.bahaya} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

/** Baris yang langsung terlihat di kartu; sisanya di balik "Lihat semua". */
const BARIS_RINGKAS = 3;

/**
 * Kartu usulan alat ubah (SPEC-asisten-agen §3): apa yang berubah (sebelum →
 * sesudah), jumlah & total, saldo kantong sebelum → sesudah. Baru diterapkan
 * saat Terapkan ditekan (RPC terapkan_usulan, satu transaksi database), dan
 * bisa diurungkan kapan saja selama transaksinya belum diubah lagi (P6).
 */
function KartuUsulanAksi({ k, ubah }: { k: KartuAksi; ubah: (patch: Partial<KartuAksi>) => void }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState(false);
  const [semua, setSemua] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { u } = k;

  async function kirim(alamat: string, isi: unknown): Promise<Record<string, unknown> | null> {
    setSibuk(true);
    setError(null);
    const res = await fetch(alamat, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isi) }).catch(() => null);
    const d = ((await res?.json().catch(() => null)) ?? null) as Record<string, unknown> | null;
    setSibuk(false);
    if (!res?.ok || !d) {
      setError(typeof d?.error === "string" ? d.error : "Gagal tersambung. Coba lagi.");
      return null;
    }
    return d;
  }

  async function terapkan() {
    const d = await kirim("/api/asisten/terapkan", { isian: u.isian, kantong: u.kantong });
    if (!d) return;
    ubah({ keadaan: "diterapkan", aksi_id: String(d.aksi_id), hasil: kalimatSaldo((d.saldo as { nama: string; saldo: number }[]) ?? []) });
    router.refresh();
  }

  async function urungkan() {
    const d = await kirim("/api/asisten/urungkan", { aksi_id: k.aksi_id, kantong: u.kantong.filter((x) => x !== "baru") });
    if (!d) return;
    const saldo = kalimatSaldo((d.saldo as { nama: string; saldo: number }[]) ?? []);
    ubah({ keadaan: "diurungkan", hasil: `${d.kantong_dihapus ? "Kantong barunya ikut dihapus. " : ""}${saldo}`.trim() });
    router.refresh();
  }

  const tampil = semua ? u.baris : u.baris.slice(0, BARIS_RINGKAS);
  return (
    <div className={s.gptUsulan} role="group" aria-label={`Usulan: ${u.judul}`}>
      <p className={s.kartuAksiJudul}>{u.judul}</p>
      {u.jumlah > 0 && (
        <p className={s.redup}>
          {u.jumlah} transaksi · {fmtIDR(u.total)}
        </p>
      )}
      {tampil.length > 0 && (
        <ul className={s.kartuAksiBaris}>
          {tampil.map((b, j) => (
            <li key={`${b.id ?? "baru"}-${j}`}>
              <span>
                {fmtTanggalPendek(b.tanggal)} · {b.teks} · {fmtIDR(b.nominal)}
              </span>
              {(b.sebelum || b.sesudah) && (
                <small className={s.redup}>
                  {b.sebelum ? `${b.sebelum} → ` : ""}
                  {b.sesudah}
                </small>
              )}
            </li>
          ))}
        </ul>
      )}
      {u.baris.length > BARIS_RINGKAS && (
        <button type="button" className={`${s.flat} ${s.flatRingkas} ${s.kartuAksiLihat}`} aria-expanded={semua} onClick={() => setSemua((x) => !x)}>
          {semua ? "Ringkas" : `Lihat semua (${u.baris.length})`}
        </button>
      )}
      {u.saldo.length > 0 && (
        <ul className={s.kartuAksiSaldo} aria-label="Saldo kantong">
          {u.saldo.map((x) => (
            <li key={x.nama}>
              Saldo {x.nama}: {x.sebelum == null ? "kantong baru" : fmtIDR(x.sebelum)} → <strong>{fmtIDR(x.sesudah)}</strong>
            </li>
          ))}
        </ul>
      )}
      {u.catatan.map((c) => (
        <small key={c} className={s.redup}>
          {c}
        </small>
      ))}
      {k.keadaan === "diterapkan" ? (
        <>
          <p>Diterapkan. {k.hasil}</p>
          <div className={s.gptUsulanTombol}>
            <button type="button" className={s.flat} disabled={sibuk} onClick={() => void urungkan()}>
              {sibuk ? <Spinner /> : "Urungkan"}
            </button>
          </div>
        </>
      ) : k.keadaan === "diurungkan" ? (
        <p>Diurungkan, semuanya kembali seperti semula. {k.hasil}</p>
      ) : k.keadaan === "batal" ? (
        <p>Tidak jadi diterapkan.</p>
      ) : (
        <div className={s.gptUsulanTombol}>
          <button type="button" className={s.flat} disabled={sibuk} onClick={() => ubah({ keadaan: "batal" })}>
            Batal
          </button>
          <button type="button" className={s.tombol} disabled={sibuk} onClick={() => void terapkan()}>
            {sibuk ? <Spinner /> : "Terapkan"}
          </button>
        </div>
      )}
      {error && (
        <small className={s.bahaya} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

const TanyaContext = createContext<{
  terbuka: boolean;
  buka: () => void;
  /** Bulan acuan halaman ini (Analitik); null = bulan berjalan. */
  aturBulan: (bulan: string | null) => void;
  /** Buka lalu langsung kirim pertanyaan, seperti kartu saran. */
  tanyaLangsung: (q: string) => void;
  sibuk: boolean;
} | null>(null);

/** Judul otomatis dari pertanyaan pertama (P4). */
const judulDari = (pesan: Pesan[]) => (pesan.find((p) => p.peran === "saya")?.teks ?? "Percakapan").replace(/\s+/g, " ").trim().slice(0, 80);

/**
 * Tanya AI di kerangka aplikasi (SPEC-cerita-tanya): obrolannya hidup di sini,
 * bukan di halaman, jadi tetap ada saat pindah halaman — di layar lebar
 * panelnya tetap terbuka saat tautan "Lihat di Riwayat" diikuti; di HP,
 * membukanya lagi menampilkan obrolan yang sama.
 *
 * Riwayat percakapan (SPEC-asisten-agen P4): tiap percakapan disimpan
 * (terenkripsi, RPC simpan_obrolan) sesudah setiap jawaban dan setiap kartu
 * berubah keadaan; daftar, buka/lanjutkan, hapus, dan Percakapan baru.
 */
export function TanyaProvider({ children }: { children: React.ReactNode }) {
  const [terbuka, setTerbuka] = useState(false);
  const [bulanHalaman, setBulanHalaman] = useState<string | null>(null);
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  // Langkah yang sedang dikerjakan asisten (dialirkan server, SPEC-asisten-agen §5).
  const [langkah, setLangkah] = useState<string[]>([]);
  // Percakapan ini sudah naik ke model besar: lanjutannya tetap di sana (§1). Tidak ditampilkan (P8).
  const [berat, setBerat] = useState(false);
  const [obrolanId, setObrolanId] = useState<string | null>(null);
  const [daftar, setDaftar] = useState<RingkasObrolan[] | null>(null);
  const bulan = bulanHalaman ?? isoLokal(new Date()).slice(0, 7);
  const db = useMemo(() => createSupabaseBrowserClient(), []);
  // Pesan terbaru untuk kerja asinkron (jawaban datang sesudah kartu lain berubah keadaan).
  const pesanRef = useRef(pesan);
  useEffect(() => {
    pesanRef.current = pesan;
  }, [pesan]);
  const aturPesan = useCallback((baru: Pesan[]) => {
    pesanRef.current = baru;
    setPesan(baru);
  }, []);

  // Simpan berurutan (antrean), supaya penyimpanan pertama (yang membuat id) selesai
  // sebelum yang berikutnya — tanpa ini satu percakapan bisa tersimpan dua kali.
  const antrean = useRef<Promise<unknown>>(Promise.resolve());
  const idRef = useRef<string | null>(null);
  // Pesan untuk percakapan yang sedang tampil saja; percakapan lain yang dibuka di tengah jalan tidak tertimpa.
  const generasi = useRef(0);

  const muatDaftar = useCallback(async () => {
    const { data } = await db.rpc("daftar_obrolan");
    setDaftar((data ?? []) as RingkasObrolan[]);
  }, [db]);

  const simpan = useCallback(
    (isi: Pesan[]) => {
      const tersimpan = isi.filter((p) => p.peran !== "galat");
      if (!tersimpan.some((p) => p.peran === "ai")) return;
      const gen = generasi.current;
      antrean.current = antrean.current.then(async () => {
        if (gen !== generasi.current) return;
        const { data, error } = await db.rpc("simpan_obrolan", { p_id: idRef.current, p_judul: judulDari(tersimpan), p_pesan: tersimpan });
        if (error) return console.error("simpan obrolan:", error.message);
        if (gen === generasi.current && !idRef.current && typeof data === "string") {
          idRef.current = data;
          setObrolanId(data);
        }
        void muatDaftar();
      });
    },
    [db, muatDaftar],
  );

  async function tanya(pertanyaan: string) {
    const q = pertanyaan.trim().slice(0, MAKS_PERTANYAAN);
    if (!q || sibuk) return;
    // Konteks percakapan: 20 pesan terakhir, tanpa pesan galat, dengan status kartu usulan.
    const riwayat = pesan.flatMap((p) => (p.peran === "galat" ? [] : [{ peran: p.peran, teks: teksRiwayat(p) }])).slice(-MAKS_RIWAYAT);
    const gen = generasi.current;
    aturPesan([...pesanRef.current, { peran: "saya", teks: q }]);
    setTeks("");
    setSibuk(true);
    setLangkah([]);
    const d = await kirimTanya({ pertanyaan: q, riwayat, bulan, berat }, (l) => setLangkah((x) => (x.at(-1) === l ? x : [...x, l])));
    setSibuk(false);
    setLangkah([]);
    if (gen !== generasi.current) return;
    if ("jawaban" in d && d.jawaban) {
      if (d.model === "berat") setBerat(true);
      const ai: PesanAI = {
        peran: "ai",
        teks: d.jawaban,
        tautan: d.tautan ?? [],
        ragu: Boolean(d.ragu),
        usulan: d.usulan,
        kartu: d.usulan_aksi?.map((u) => ({ u, keadaan: "siap" as const })),
        catatan: d.catatan,
        lanjutkan: d.lanjutkan,
        model: d.model,
      };
      const baru = [...pesanRef.current, ai];
      aturPesan(baru);
      simpan(baru);
    } else aturPesan([...pesanRef.current, { peran: "galat", teks: ("error" in d && d.error) || "Lagi sibuk, coba lagi sebentar ya." }]);
  }

  /** Ubah keadaan kartu di pesan ke-i, lalu simpan percakapannya. */
  function ubahPesan(i: number, ubah: (p: PesanAI) => PesanAI) {
    const lama = pesanRef.current;
    const p = lama[i];
    if (!p || p.peran !== "ai") return;
    const baru = lama.map((x, j) => (j === i ? ubah(p) : x));
    aturPesan(baru);
    simpan(baru);
  }

  function obrolanBaru() {
    if (sibuk) return;
    generasi.current++;
    idRef.current = null;
    setObrolanId(null);
    aturPesan([]);
    setBerat(false);
    setTeks("");
  }

  async function bukaObrolan(id: string) {
    if (sibuk) return false;
    const { data, error } = await db.rpc("buka_obrolan", { p_id: id });
    const o = (data as { id: string; pesan: Pesan[] }[] | null)?.[0];
    if (error || !o) return false;
    generasi.current++;
    idRef.current = o.id;
    setObrolanId(o.id);
    const isi = Array.isArray(o.pesan) ? o.pesan : [];
    aturPesan(isi);
    setBerat(isi.some((p) => p.peran === "ai" && p.model === "berat"));
    return true;
  }

  async function hapusObrolan(id: string) {
    const { data } = await db.rpc("hapus_obrolan", { p_id: id });
    if (data === true && id === idRef.current) obrolanBaru();
    await muatDaftar();
  }

  return (
    <TanyaContext.Provider
      value={{
        terbuka,
        buka: () => setTerbuka(true),
        aturBulan: setBulanHalaman,
        tanyaLangsung: (q) => {
          setTerbuka(true);
          void tanya(q);
        },
        sibuk,
      }}
    >
      {children}
      {terbuka && (
        <TanyaAI
          namaBulan={Besar(namaBulan(`${bulan}-01`))}
          namaBulanLalu={Besar(namaBulan(`${geserBulan(bulan, -1)}-01`))}
          pesan={pesan}
          sibuk={sibuk}
          langkah={langkah}
          teks={teks}
          setTeks={setTeks}
          tanya={tanya}
          ubahPesan={ubahPesan}
          obrolanId={obrolanId}
          daftar={daftar}
          muatDaftar={muatDaftar}
          obrolanBaru={obrolanBaru}
          bukaObrolan={bukaObrolan}
          hapusObrolan={hapusObrolan}
          onClose={() => setTerbuka(false)}
        />
      )}
    </TanyaContext.Provider>
  );
}

/** Halaman yang punya bulan pilihan (Analitik): Tanya AI memakai bulan itu selama halamannya tampil. */
export function useTanyaBulan(bulan: string) {
  const aturBulan = useContext(TanyaContext)?.aturBulan;
  useEffect(() => {
    aturBulan?.(bulan);
    return () => aturBulan?.(null);
  }, [aturBulan, bulan]);
}

/** Buka Tanya AI dan langsung kirim pertanyaan (Refleksi Kakeibo di Analitik); null di luar provider. */
export function useTanyaLangsung() {
  const t = useContext(TanyaContext);
  return t && { kirim: t.tanyaLangsung, sibuk: t.sibuk };
}

/** Tombol melayang kanan bawah, seperti tombol AI di WhatsApp (Beranda, Analitik). */
export function TombolTanya() {
  const t = useContext(TanyaContext);
  if (!t || t.terbuka) return null;
  return (
    <button type="button" className={s.tombolAI} aria-label="Tanya AI soal keuanganmu" onClick={t.buka}>
      <IkonAI />
    </button>
  );
}

/** "Hari ini 14.05" / "8 Nov" untuk daftar percakapan. */
function kapanObrolan(iso: string) {
  const d = new Date(iso);
  return isoLokal(d) === isoLokal(new Date())
    ? `Hari ini ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d)}`
    : fmtTanggalPendek(isoLokal(d));
}

/** Daftar percakapan tersimpan (P4): buka, hapus (dengan konfirmasi di barisnya). */
function DaftarObrolan({
  daftar,
  aktif,
  buka,
  hapus,
}: {
  daftar: RingkasObrolan[] | null;
  aktif: string | null;
  buka: (id: string) => void;
  hapus: (id: string) => Promise<void>;
}) {
  const [tanyaHapus, setTanyaHapus] = useState<string | null>(null);
  if (!daftar) return <p className={s.redup}>Memuat percakapan…</p>;
  if (!daftar.length) return <p className={`${s.redup} ${s.riwayatObrolanKosong}`}>Belum ada percakapan tersimpan.</p>;
  return (
    <ul className={s.riwayatObrolan} aria-label="Percakapan tersimpan">
      {daftar.map((o) =>
        tanyaHapus === o.id ? (
          <li key={o.id} className={s.riwayatObrolanHapus}>
            <span>Hapus “{o.judul}”?</span>
            <div className={s.gptUsulanTombol}>
              <button type="button" className={`${s.flat} ${s.flatRingkas}`} onClick={() => setTanyaHapus(null)}>
                Batal
              </button>
              <button
                type="button"
                className={`${s.flat} ${s.flatRingkas} ${s.flatBahaya}`}
                onClick={() => {
                  setTanyaHapus(null);
                  void hapus(o.id);
                }}
              >
                Hapus
              </button>
            </div>
          </li>
        ) : (
          <li key={o.id}>
            <button type="button" className={s.riwayatObrolanBuka} aria-current={o.id === aktif ? "true" : undefined} onClick={() => buka(o.id)}>
              <span>{o.judul}</span>
              <small className={s.redup}>{kapanObrolan(o.diubah)}</small>
            </button>
            <button type="button" className={s.ikonTombol} aria-label={`Hapus percakapan ${o.judul}`} onClick={() => setTanyaHapus(o.id)}>
              <Trash2 size={18} aria-hidden />
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * Lembar obrolan ala ChatGPT (SPEC-analitik-ai): layar kosong dengan sapaan &
 * kartu saran, pesan user dalam gelembung abu di kanan, jawaban AI teks biasa
 * selebar layar, kolom ketik berbentuk kapsul yang selalu di bawah. Di layar
 * lebar jadi panel di kanan supaya grafik tetap terlihat.
 *
 * Riwayat percakapan (P4): di HP tombol riwayat & Percakapan baru di kanan
 * atas, daftarnya menggantikan isi lembar; di layar lebar (≥ 1024 px) daftar
 * selalu di samping obrolan.
 */
function TanyaAI({
  namaBulan,
  namaBulanLalu,
  pesan,
  sibuk,
  langkah,
  teks,
  setTeks,
  tanya,
  ubahPesan,
  obrolanId,
  daftar,
  muatDaftar,
  obrolanBaru,
  bukaObrolan,
  hapusObrolan,
  onClose,
}: {
  namaBulan: string;
  namaBulanLalu: string;
  pesan: Pesan[];
  sibuk: boolean;
  langkah: string[];
  teks: string;
  setTeks: (t: string) => void;
  tanya: (q: string) => Promise<void>;
  ubahPesan: (i: number, ubah: (p: PesanAI) => PesanAI) => void;
  obrolanId: string | null;
  daftar: RingkasObrolan[] | null;
  muatDaftar: () => Promise<void>;
  obrolanBaru: () => void;
  bukaObrolan: (id: string) => Promise<boolean>;
  hapusObrolan: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  // Pertanyaan bertahap bisa lama: setelah 8 detik, beri tahu masih dikerjakan.
  const [lama, setLama] = useState(false);
  useEffect(() => {
    if (!sibuk) return;
    const t = setTimeout(() => setLama(true), 8000);
    return () => {
      clearTimeout(t);
      setLama(false);
    };
  }, [sibuk]);
  // HP: daftar percakapan menggantikan isi lembar.
  const [lihatRiwayat, setLihatRiwayat] = useState(false);
  useEffect(() => {
    void muatDaftar();
  }, [muatDaftar]);
  const akhirRef = useRef<HTMLDivElement>(null);
  const ketikRef = useRef<HTMLTextAreaElement>(null);
  const saran = [
    { judul: `Kenapa ${namaBulan} boros?`, sub: "Cari penyebabnya" },
    { judul: `Bandingin sama ${namaBulanLalu}`, sub: "Naik atau turun" },
    { judul: "Pengeluaran terbesarku", sub: `di ${namaBulan}` },
    { judul: "Saldo semua kantong", sub: "dan total aset" },
  ];

  // Berkurung kurawal: scrollIntoView di Chromium baru mengembalikan Promise,
  // dan nilai kembalian efek dianggap React sebagai fungsi pembersih.
  useEffect(() => {
    akhirRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [pesan, sibuk, langkah]);

  // Kolom ketik tumbuh mengikuti isinya (sampai batas tinggi di CSS).
  useEffect(() => {
    const el = ketikRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [teks, lihatRiwayat]);

  function kirim(e?: FormEvent) {
    e?.preventDefault();
    void tanya(teks);
  }

  // Di HP, tautan membuka halaman di balik lembar layar penuh: tutup dulu
  // (obrolannya tetap ada). Di layar lebar panelnya tetap di samping.
  const ikutiTautan = () => {
    if (!window.matchMedia(LAYAR_LEBAR).matches) onClose();
  };

  const kosong = pesan.length === 0 && !sibuk;
  const buka = async (id: string) => {
    if (await bukaObrolan(id)) setLihatRiwayat(false);
  };

  const aksi = (
    <>
      <button
        type="button"
        className={`${s.ikonTombol} ${s.tanyaTombolRiwayat}`}
        aria-label="Riwayat percakapan"
        aria-pressed={lihatRiwayat}
        onClick={() => {
          if (!lihatRiwayat) void muatDaftar();
          setLihatRiwayat((x) => !x);
        }}
      >
        <History size={22} aria-hidden />
      </button>
      <button
        type="button"
        className={s.ikonTombol}
        aria-label="Percakapan baru"
        disabled={sibuk}
        onClick={() => {
          obrolanBaru();
          setLihatRiwayat(false);
        }}
      >
        <SquarePen size={22} aria-hidden />
      </button>
    </>
  );

  return (
    <Lembar judul="Tanya AI" posisi="samping" aksi={aksi} onClose={onClose}>
      <div className={`${s.tanyaTata} ${lihatRiwayat ? s.tanyaTataRiwayat : ""}`}>
        <aside className={s.tanyaSamping} aria-label="Riwayat percakapan">
          <DaftarObrolan daftar={daftar} aktif={obrolanId} buka={(id) => void buka(id)} hapus={hapusObrolan} />
        </aside>
        <div className={s.gptRuang}>
          {kosong ? (
            <div className={s.gptKosong}>
              <IkonAI size={36} />
              <h3>Mau tahu apa soal keuanganmu?</h3>
              <p className={s.redup}>Pengeluaran, saldo, utang, atau cicilan. Angkanya kuambil langsung dari catatanmu, dan bisa kubantu rapikan.</p>
            </div>
          ) : (
            <div className={s.gptPesan}>
              {pesan.map((p, i) =>
                p.peran === "saya" ? (
                  <div key={i} className={s.gptSaya}>
                    {p.teks}
                  </div>
                ) : (
                  <div key={i} className={`${s.gptAI} ${p.peran === "galat" ? s.bahaya : ""}`} role={p.peran === "galat" ? "alert" : undefined}>
                    {p.teks}
                    {p.peran === "ai" && p.ragu && <small>⚠️ Ada angka yang belum bisa dipastikan. Cek angkanya di Riwayat.</small>}
                    {p.peran === "ai" && p.usulan && (
                      <KartuUsulan
                        key={`${obrolanId}-${i}`}
                        u={p.usulan}
                        awal={p.usulanKeadaan}
                        simpan={(k) => ubahPesan(i, (x) => ({ ...x, usulanKeadaan: k }))}
                      />
                    )}
                    {p.peran === "ai" &&
                      p.kartu?.map((k, j) => (
                        <KartuUsulanAksi key={k.u.kunci} k={k} ubah={(patch) => ubahPesan(i, (x) => ({ ...x, kartu: x.kartu?.map((y, n) => (n === j ? { ...y, ...patch } : y)) }))} />
                      ))}
                    {p.peran === "ai" && p.catatan && <small className={s.redup}>{p.catatan}</small>}
                    {p.peran === "ai" && p.lanjutkan && i === pesan.length - 1 && !sibuk && (
                      <div className={s.gptUsulanTombol}>
                        <button type="button" className={s.flat} onClick={() => void tanya("Lanjutkan")}>
                          Lanjutkan
                        </button>
                      </div>
                    )}
                    {p.peran === "ai" && p.tautan.length > 0 && (
                      <div className={s.gptTautan}>
                        {p.tautan.map((t) => (
                          <NextLink key={t.href} href={t.href} onClick={ikutiTautan}>
                            {t.label}
                          </NextLink>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              )}
              {sibuk && (
                <div className={s.gptMemuat} role="status" aria-label="Menghitung">
                  <span />
                  {langkah.length > 0 ? (
                    <ol className={s.gptLangkah} aria-label="Langkah asisten">
                      {langkah.map((l, j) => (
                        <li key={j} className={j === langkah.length - 1 ? undefined : s.redup}>
                          {l}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    lama && <p className={s.redup}>Masih menghitung, pertanyaan ini butuh beberapa langkah…</p>
                  )}
                </div>
              )}
              <div ref={akhirRef} />
            </div>
          )}

          <div className={s.tanyaBawah}>
            {kosong && (
              <div className={s.gptSaran}>
                {saran.map((x) => (
                  <button key={x.judul} type="button" onClick={() => void tanya(x.judul)}>
                    <span>{x.judul}</span>
                    <span className={s.redup}>{x.sub}</span>
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={kirim} className={s.gptKomposer}>
              <textarea
                ref={ketikRef}
                rows={1}
                aria-label="Tulis pertanyaan"
                placeholder="Tanya atau minta rapikan catatanmu"
                maxLength={MAKS_PERTANYAAN}
                value={teks}
                onChange={(e) => setTeks(e.target.value.replace(/\n/g, " "))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    kirim();
                  }
                }}
              />
              <button type="submit" className={s.gptKirim} aria-label="Kirim" disabled={sibuk || !teks.trim()}>
                <ArrowUp size={22} strokeWidth={2.6} />
              </button>
            </form>
            <p className={s.gptCatatan}>Pertanyaan &amp; ringkasan datamu diproses AI (Gemini). Perubahan baru terjadi setelah kamu menekan Terapkan.</p>
          </div>
        </div>
      </div>
    </Lembar>
  );
}

/**
 * Kirim pertanyaan ke /api/tanya dan baca alirannya (SPEC-asisten-agen §5):
 * langkah diteruskan ke `diLangkah`, lalu jawaban akhirnya. Balasan JSON biasa
 * (galat validasi, atau server/tiruan tanpa aliran) tetap dibaca.
 */
async function kirimTanya(
  isi: { pertanyaan: string; riwayat: { peran: string; teks: string }[]; bulan: string; berat: boolean },
  diLangkah: (teks: string) => void,
): Promise<HasilTanya | { error?: string }> {
  const res = await fetch("/api/tanya", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: `${TIPE_ALIR}, application/json` },
    body: JSON.stringify(isi),
  }).catch(() => null);
  if (!res) return {};
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes(TIPE_ALIR) || !res.body) {
    const d = ((await res.json().catch(() => null)) ?? {}) as HasilTanya | { error?: string };
    return res.ok ? d : { error: "error" in d ? d.error : undefined };
  }
  const baca = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const urai = pengurai<HasilTanya>();
  let hasil: HasilTanya | { error?: string } = {};
  const terima = (daftar: ReturnType<typeof urai.tambah>) => {
    for (const p of daftar) {
      if (p.t === "langkah") diLangkah(p.teks);
      else if (p.t === "jawaban") hasil = p.isi;
      else hasil = { error: p.error };
    }
  };
  try {
    for (;;) {
      const { value, done } = await baca.read();
      if (done) break;
      terima(urai.tambah(value));
    }
    terima(urai.selesai());
  } catch {
    // Sambungan putus di tengah: pakai yang sudah diterima (bisa kosong → pesan sibuk).
  }
  return hasil;
}
