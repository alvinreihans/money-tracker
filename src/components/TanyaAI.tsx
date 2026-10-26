"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkles } from "lucide-react";
import { LAYAR_LEBAR } from "@/components/navigasi";
import { Lembar, Spinner } from "@/components/oneui";
import { kembalikanKategori, ubahKategoriMerchant, type HasilUbahKategori } from "@/components/TawaranSerupa";
import s from "@/components/ui.module.css";
import { isoLokal, namaBulan } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";
import type { UsulanKategori } from "@/lib/tanya-server";

type Pesan =
  | { peran: "saya"; teks: string }
  | { peran: "ai"; teks: string; tautan: { label: string; href: string }[]; ragu: boolean; usulan?: UsulanKategori }
  | { peran: "galat"; teks: string };

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

/**
 * Kartu konfirmasi usulan Tanya AI (SPEC-ingat-kategori): AI hanya
 * mengusulkan; kategori baru berubah setelah user menekan Ubah, dan bisa
 * diurungkan. Server mencari ulang transaksinya saat Ubah ditekan.
 */
function KartuUsulan({ u }: { u: UsulanKategori }) {
  const router = useRouter();
  const [keadaan, setKeadaan] = useState<"siap" | "sibuk" | "diubah" | "batal" | "dikembalikan">("siap");
  const [hasil, setHasil] = useState<HasilUbahKategori | null>(null);
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
            <button type="button" className={s.flat} disabled={keadaan === "sibuk"} onClick={() => setKeadaan("batal")}>
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

const TanyaContext = createContext<{
  terbuka: boolean;
  buka: () => void;
  /** Bulan acuan halaman ini (Analitik); null = bulan berjalan. */
  aturBulan: (bulan: string | null) => void;
} | null>(null);

/**
 * Tanya AI di kerangka aplikasi (SPEC-cerita-tanya): obrolannya hidup di sini,
 * bukan di halaman, jadi tetap ada saat pindah halaman — di layar lebar
 * panelnya tetap terbuka saat tautan "Lihat di Riwayat" diikuti; di HP,
 * membukanya lagi menampilkan obrolan yang sama. Tidak disimpan setelah
 * aplikasi ditutup.
 */
export function TanyaProvider({ children }: { children: React.ReactNode }) {
  const [terbuka, setTerbuka] = useState(false);
  const [bulanHalaman, setBulanHalaman] = useState<string | null>(null);
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const bulan = bulanHalaman ?? isoLokal(new Date()).slice(0, 7);

  async function tanya(pertanyaan: string) {
    const q = pertanyaan.trim();
    if (!q || sibuk) return;
    // Konteks percakapan: 6 pesan terakhir, tanpa pesan galat.
    const riwayat = pesan.flatMap((p) => (p.peran === "galat" ? [] : [{ peran: p.peran, teks: p.teks }])).slice(-6);
    setPesan((p) => [...p, { peran: "saya", teks: q }]);
    setTeks("");
    setSibuk(true);
    const res = await fetch("/api/tanya", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pertanyaan: q, riwayat, bulan }),
    }).catch(() => null);
    const d = ((await res?.json().catch(() => null)) ?? {}) as {
      jawaban?: string;
      tautan?: { label: string; href: string }[];
      ragu?: boolean;
      usulan?: UsulanKategori;
      error?: string;
    };
    setSibuk(false);
    setPesan((p) => [
      ...p,
      res?.ok && d.jawaban
        ? { peran: "ai", teks: d.jawaban, tautan: d.tautan ?? [], ragu: Boolean(d.ragu), usulan: d.usulan }
        : { peran: "galat", teks: d.error ?? "Lagi sibuk, coba lagi sebentar ya." },
    ]);
  }

  return (
    <TanyaContext.Provider value={{ terbuka, buka: () => setTerbuka(true), aturBulan: setBulanHalaman }}>
      {children}
      {terbuka && (
        <TanyaAI
          namaBulan={Besar(namaBulan(`${bulan}-01`))}
          namaBulanLalu={Besar(namaBulan(`${geserBulan(bulan, -1)}-01`))}
          pesan={pesan}
          sibuk={sibuk}
          teks={teks}
          setTeks={setTeks}
          tanya={tanya}
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

/**
 * Lembar obrolan ala ChatGPT (SPEC-analitik-ai): layar kosong dengan sapaan &
 * kartu saran, pesan user dalam gelembung abu di kanan, jawaban AI teks biasa
 * selebar layar, kolom ketik berbentuk kapsul yang selalu di bawah. Di layar
 * lebar jadi panel di kanan supaya grafik tetap terlihat.
 */
function TanyaAI({
  namaBulan,
  namaBulanLalu,
  pesan,
  sibuk,
  teks,
  setTeks,
  tanya,
  onClose,
}: {
  namaBulan: string;
  namaBulanLalu: string;
  pesan: Pesan[];
  sibuk: boolean;
  teks: string;
  setTeks: (t: string) => void;
  tanya: (q: string) => Promise<void>;
  onClose: () => void;
}) {
  // Pertanyaan bertahap bisa lama: setelah 8 detik, beri tahu masih dikerjakan.
  const [lama, setLama] = useState(false);
  useEffect(() => {
    if (!sibuk) return setLama(false);
    const t = setTimeout(() => setLama(true), 8000);
    return () => clearTimeout(t);
  }, [sibuk]);
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
  }, [pesan, sibuk]);

  // Kolom ketik tumbuh mengikuti isinya (sampai batas tinggi di CSS).
  useEffect(() => {
    const el = ketikRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [teks]);

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

  return (
    <Lembar judul="Tanya AI" posisi="samping" onClose={onClose}>
      <div className={s.gptRuang}>
        {kosong ? (
          <div className={s.gptKosong}>
            <IkonAI size={36} />
            <h3>Mau tahu apa soal keuanganmu?</h3>
            <p className={s.redup}>Pengeluaran, saldo, utang, atau cicilan. Angkanya kuambil langsung dari catatanmu.</p>
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
                  {p.peran === "ai" && p.usulan && <KartuUsulan u={p.usulan} />}
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
                {lama && <p className={s.redup}>Masih menghitung, pertanyaan ini butuh beberapa langkah…</p>}
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
              placeholder="Tanya soal keuanganmu"
              maxLength={300}
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
          <p className={s.gptCatatan}>Pertanyaan &amp; ringkasan datamu diproses AI (Gemini).</p>
        </div>
      </div>
    </Lembar>
  );
}
