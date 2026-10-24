"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import NextLink from "next/link";
import { SendHorizontal } from "lucide-react";
import { Lembar, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";

type Pesan =
  | { peran: "saya"; teks: string }
  | { peran: "ai"; teks: string; tautan: { label: string; href: string }[]; ragu: boolean }
  | { peran: "galat"; teks: string };

/**
 * Tanya AI di Analitik (SPEC-analitik-ai): lembar obrolan layar penuh dengan
 * gelembung yang sama seperti lembar Catat. Obrolan hanya ada di sini —
 * tidak disimpan; menutup lembar berarti obrolannya hilang.
 */
export default function TanyaAI({ bulan, namaBulan, namaBulanLalu, onClose }: { bulan: string; namaBulan: string; namaBulanLalu: string; onClose: () => void }) {
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const akhirRef = useRef<HTMLDivElement>(null);
  const saran = [`Kenapa ${namaBulan} boros?`, `Bandingin sama ${namaBulanLalu}`, "Pengeluaran terbesarku apa?", "Saldo semua kantong"];

  // Pesan baru (atau status menunggu) selalu terlihat.
  // Berkurung kurawal: scrollIntoView di Chromium baru mengembalikan Promise,
  // dan nilai kembalian efek dianggap React sebagai fungsi pembersih.
  useEffect(() => {
    akhirRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [pesan, sibuk]);

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

  return (
    <Lembar judul="Tanya AI" posisi="penuh" onClose={onClose}>
      <div className={s.obrolan} style={{ minHeight: "100%", paddingBottom: 8 }}>
        <div className={`${s.bub} ${s.bubApp}`}>
          Hai! Tanya apa saja soal catatan keuanganmu, misalnya pengeluaran, saldo, atau utang. Angkanya kuambil langsung dari catatanmu.
          {pesan.length === 0 && (
            <div className={s.pilihanJawab}>
              {saran.map((x) => (
                <button key={x} type="button" onClick={() => void tanya(x)}>
                  {x}
                </button>
              ))}
            </div>
          )}
        </div>

        {pesan.map((p, i) =>
          p.peran === "saya" ? (
            <div key={i} className={`${s.bub} ${s.bubSaya}`}>
              {p.teks}
            </div>
          ) : (
            <div key={i} className={`${s.bub} ${s.bubApp}`} style={{ whiteSpace: "pre-wrap" }} role={p.peran === "galat" ? "alert" : undefined}>
              {p.teks}
              {p.peran === "ai" && p.ragu && <small>⚠️ Ada angka yang belum bisa dipastikan. Cek angkanya di Riwayat.</small>}
              {p.peran === "ai" && p.tautan.length > 0 && (
                <div className={s.pilihanJawab}>
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
          <div className={s.statusObrolan} role="status">
            <Spinner /> Menghitung…
          </div>
        )}
        <div ref={akhirRef} />
      </div>

      <div className={s.tanyaBawah}>
        <form onSubmit={kirim} className={s.komposer}>
          <div className={s.ketik}>
            <textarea
              rows={1}
              aria-label="Tulis pertanyaan"
              placeholder="Tanya soal keuanganmu…"
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
          </div>
          <button type="submit" className={s.kirimBulat} aria-label="Kirim" disabled={sibuk || !teks.trim()}>
            <SendHorizontal size={22} />
          </button>
        </form>
        <p className={s.redup} style={{ margin: "8px 4px 0", fontSize: 12 }}>
          Pertanyaan &amp; ringkasan datamu diproses AI (Gemini).
        </p>
      </div>
    </Lembar>
  );
}
