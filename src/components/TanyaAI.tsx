"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import NextLink from "next/link";
import { ArrowUp, Sparkles } from "lucide-react";
import { Lembar } from "@/components/oneui";
import s from "@/components/ui.module.css";

type Pesan =
  | { peran: "saya"; teks: string }
  | { peran: "ai"; teks: string; tautan: { label: string; href: string }[]; ragu: boolean }
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

/**
 * Tanya AI di Analitik (SPEC-analitik-ai), tampilan ala ChatGPT: layar kosong
 * dengan sapaan & kartu saran, pesan user dalam gelembung abu di kanan,
 * jawaban AI teks biasa selebar layar, kolom ketik berbentuk kapsul yang
 * selalu di bawah. Obrolan hanya ada di sini — tidak disimpan. Di layar
 * lebar, obrolan jadi panel di kanan supaya grafik tetap terlihat.
 */
export default function TanyaAI({ bulan, namaBulan, namaBulanLalu, onClose }: { bulan: string; namaBulan: string; namaBulanLalu: string; onClose: () => void }) {
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
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
    const d = ((await res?.json().catch(() => null)) ?? {}) as { jawaban?: string; tautan?: { label: string; href: string }[]; ragu?: boolean; error?: string };
    setSibuk(false);
    setPesan((p) => [
      ...p,
      res?.ok && d.jawaban
        ? { peran: "ai", teks: d.jawaban, tautan: d.tautan ?? [], ragu: Boolean(d.ragu) }
        : { peran: "galat", teks: d.error ?? "Lagi sibuk, coba lagi sebentar ya." },
    ]);
  }

  function kirim(e?: FormEvent) {
    e?.preventDefault();
    void tanya(teks);
  }

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
                  {p.peran === "ai" && p.tautan.length > 0 && (
                    <div className={s.gptTautan}>
                      {p.tautan.map((t) => (
                        <NextLink key={t.href} href={t.href}>
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
