"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Landmark, Plus } from "lucide-react";
import { BarisPilih, Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { fmtIDR } from "@/lib/format";
import type { Pilihan, Ragu, RingkasRekening, TawaranDeposito } from "@/lib/rekening/rencana";

/**
 * Impor rekening koran (docs/specs/SPEC-impor-rekening.md): PDF dari Catat,
 * seret-lepas, atau Bagikan → pratinjau (tidak mengubah apa pun) → Impor /
 * Batal. Rekening yang belum dikenal ditanya sekali "kantong yang mana?";
 * 4 digit akhirnya diingat. PDF hanya dikirim ke server untuk dibaca, tidak
 * disimpan.
 */

interface Pratinjau {
  rekening: RingkasRekening[];
  belumDipetakan: { kunci: string; nama: string; bank: string; nomorAkhir: string; utama: boolean }[];
  kantongBaru: { kunci: string; name: string; kind: string }[];
  tawaranDeposito: TawaranDeposito[];
  ragu: Ragu[];
  pilihanKantong: { id: string; name: string; kind: string; emoji: string | null }[];
  bank: Record<string, string>;
}

/** Nominal bertanda seperti daftar transaksi: "−Rp 18.000" (tanda minus, bukan tanda hubung). */
const rp = (n: number) => (n < 0 ? `−${fmtIDR(-n)}` : fmtIDR(n));

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso: string) => ({ h: Number(iso.slice(8, 10)), b: BULAN[Number(iso.slice(5, 7)) - 1], t: iso.slice(0, 4) });

/** "1–30 Sep 2026", "1 Mar – 31 Okt 2026", "4 Mei 2022 – 1 Nov 2026". */
export function teksPeriode(dari: string, sampai: string) {
  const a = tgl(dari);
  const z = tgl(sampai);
  if (a.t !== z.t) return `${a.h} ${a.b} ${a.t} – ${z.h} ${z.b} ${z.t}`;
  if (a.b !== z.b) return `${a.h} ${a.b} – ${z.h} ${z.b} ${z.t}`;
  return a.h === z.h ? `${z.h} ${z.b} ${z.t}` : `${a.h}–${z.h} ${z.b} ${z.t}`;
}

async function kirim(url: string, berkas: File[], pilihan: Pilihan) {
  const form = new FormData();
  for (const f of berkas) form.append("berkas", f);
  form.append("pilihan", JSON.stringify(pilihan));
  try {
    const res = await fetch(url, { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Koneksinya bermasalah." } as Record<string, unknown> };
  }
}

export default function ImporRekening({ berkas, onClose, onSelesai }: { berkas: File[]; onClose: () => void; onSelesai: (teks: string) => void }) {
  const router = useRouter();
  const [pilihan, setPilihan] = useState<Pilihan>({});
  const [data, setData] = useState<Pratinjau | null>(null);
  const [galat, setGalat] = useState<{ nama?: string; pesan: string }[] | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [mengimpor, setMengimpor] = useState(false);
  // Jawaban "kantong yang mana?" yang belum dikirim.
  const [jawab, setJawab] = useState<Record<string, string>>({});
  const urut = useRef(0);

  function muat(p: Pilihan) {
    const ke = ++urut.current;
    return kirim("/api/rekening/pratinjau", berkas, p).then(({ ok, data }) => terima(ke, ok, data));
  }

  function terima(ke: number, ok: boolean, d: Record<string, unknown>) {
    if (ke !== urut.current) return; // jawaban lama
    setMemuat(false);
    if (Array.isArray(d.galat)) return setGalat(d.galat as { nama: string; pesan: string }[]);
    if (!ok) return setGalat([{ pesan: typeof d.error === "string" ? d.error : "Rekening korannya gagal dibaca." }]);
    setGalat(null);
    setData(d as unknown as Pratinjau);
  }

  useEffect(() => {
    void muat({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ubah = (p: Partial<Pilihan>) => {
    const baru = { ...pilihan, ...p };
    setPilihan(baru);
    setMemuat(true);
    void muat(baru);
  };

  async function impor() {
    setMengimpor(true);
    const { ok, data: d } = await kirim("/api/rekening/impor", berkas, pilihan);
    setMengimpor(false);
    if (Array.isArray(d.galat)) return setGalat(d.galat as { nama: string; pesan: string }[]);
    if (!ok) return setGalat([{ pesan: typeof d.error === "string" ? d.error : "Rekening korannya gagal diimpor." }]);
    const h = (d.hasil ?? {}) as { transaksi?: number; tautan?: number };
    const bagian = [`${h.transaksi ?? 0} transaksi baru`, h.tautan ? `${h.tautan} ditautkan ke yang sudah tercatat` : null].filter(Boolean);
    router.refresh();
    onSelesai(`Rekening koran diimpor: ${bagian.join(", ")}.`);
  }

  const tanya = data?.belumDipetakan.filter((r) => r.utama) ?? [];
  const tampil = (data?.rekening ?? []).filter((r) => r.kantong || r.baris > 0 || r.saldoBank !== 0);
  const sibuk = memuat || mengimpor;

  let isi: React.ReactNode;
  if (galat) {
    isi = (
      <>
        {galat.map((g, i) => (
          <Pesan key={i} jenis="bahaya" judul={g.nama}>
            {g.pesan}
          </Pesan>
        ))}
      </>
    );
  } else if (!data) {
    isi = <Spinner label={`Membaca ${berkas.length > 1 ? `${berkas.length} rekening koran` : "rekening koran"}…`} />;
  } else if (tanya.length) {
    isi = (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {tanya.map((r) => (
          <div key={r.kunci} className={s.blok}>
            <h3 className={s.judulBagian} style={{ paddingBottom: 8 }}>
              Rekening {r.nama} ini kantong yang mana?
            </h3>
            <div role="radiogroup" aria-label={`Kantong untuk ${r.nama}`}>
              {data.pilihanKantong.map((k) => (
                <BarisPilih key={k.id} peran="radio" dipilih={jawab[r.kunci] === k.id} onClick={() => setJawab((j) => ({ ...j, [r.kunci]: k.id }))}>
                  <span className={s.barisEmoji} aria-hidden>
                    {k.emoji ?? "🏦"}
                  </span>
                  <span className={s.barisTeks}>
                    <span className={s.barisJudul}>{k.name}</span>
                  </span>
                </BarisPilih>
              ))}
              <BarisPilih peran="radio" dipilih={jawab[r.kunci] === "baru"} onClick={() => setJawab((j) => ({ ...j, [r.kunci]: "baru" }))}>
                <span className={s.barisEmoji} aria-hidden>
                  <Plus size={20} />
                </span>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul}>Buat kantong {data.bank[r.kunci] ?? "baru"}</span>
                </span>
              </BarisPilih>
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    isi = (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {tampil.map((r) => (
          <KartuRekening key={r.kunci} r={r} baru={data.kantongBaru.some((k) => k.kunci === r.kantong)} samakan={Boolean(pilihan.samakan?.includes(r.kunci))} onSamakan={(ya) => ubah({ samakan: ya ? [...(pilihan.samakan ?? []), r.kunci] : (pilihan.samakan ?? []).filter((k) => k !== r.kunci) })} />
        ))}
        {data.tawaranDeposito.map((d) => (
          <div key={d.kunci} className={s.blok}>
            <BarisPilih peran="checkbox" dipilih={Boolean(pilihan.deposito?.includes(d.kunci))} onClick={() => ubah({ deposito: pilihan.deposito?.includes(d.kunci) ? pilihan.deposito.filter((k) => k !== d.kunci) : [...(pilihan.deposito ?? []), d.kunci] })}>
              <span className={s.barisEmoji} aria-hidden>
                💰
              </span>
              <span className={s.barisTeks}>
                <span style={{ whiteSpace: "normal" }}>{d.teks}</span>
                <span className={s.redup}>Jatuh tempo {teksPeriode(d.jatuh_tempo, d.jatuh_tempo)}</span>
              </span>
            </BarisPilih>
          </div>
        ))}
        {data.ragu.length > 0 && (
          <section className={s.blok} aria-labelledby="ragu-judul">
            <h3 id="ragu-judul" className={s.judulBagian}>
              Mungkin sudah tercatat ({data.ragu.length})
            </h3>
            <p className={s.redup} style={{ margin: 0, padding: "0 20px 4px" }}>
              Ada beberapa transaksi yang cocok. Pilih yang sama dengan baris rekening koran ini.
            </p>
            {data.ragu.map((g) => {
              const dipilih = pilihan.ragu?.[g.ref] ?? g.dipilih;
              const pilihRagu = (id: string) => ubah({ ragu: { ...pilihan.ragu, [g.ref]: id } });
              const label = `${g.rekening} · ${teksPeriode(g.tanggal, g.tanggal)} · ${rp(g.nominal)}`;
              return (
                // Daftar pilihan yang membungkus teks, jam di depan (SPEC-perbaikan-uiux #11).
                <div key={g.ref} role="radiogroup" aria-label={label} style={{ paddingTop: 8 }}>
                  <p className={s.blokIsi} style={{ margin: 0, padding: "8px 20px 0", fontWeight: 600 }}>
                    {label}
                  </p>
                  {g.kandidat.map((k) => (
                    <BarisPilih key={k.id} peran="radio" dipilih={dipilih === k.id} onClick={() => pilihRagu(k.id)}>
                      <span className={s.barisTeks}>
                        <span style={{ whiteSpace: "normal" }}>{k.label}</span>
                      </span>
                    </BarisPilih>
                  ))}
                  <BarisPilih peran="radio" dipilih={dipilih === "baru"} onClick={() => pilihRagu("baru")}>
                    <span className={s.barisTeks}>
                      <span style={{ whiteSpace: "normal" }}>Bukan, catat sebagai baru</span>
                    </span>
                  </BarisPilih>
                </div>
              );
            })}
          </section>
        )}
      </div>
    );
  }

  const pil = galat
    ? [{ label: "Tutup", onClick: onClose }]
    : tanya.length
      ? [
          { label: "Batal", batal: true as const, disabled: sibuk },
          {
            label: memuat ? <Spinner /> : "Lanjut",
            disabled: sibuk || tanya.some((r) => !jawab[r.kunci]),
            onClick: () => ubah({ peta: { ...pilihan.peta, ...jawab } }),
          },
        ]
      : [
          { label: "Batal", batal: true as const, disabled: mengimpor },
          { label: mengimpor ? <Spinner /> : "Impor", disabled: sibuk || !data, onClick: () => void impor() },
        ];

  return (
    <Lembar judul="Impor rekening koran" posisi="penuh" onClose={() => !mengimpor && onClose()} pil={pil}>
      <div aria-busy={sibuk} style={{ opacity: memuat && data ? 0.6 : 1, transition: "opacity .2s" }}>
        {isi}
      </div>
    </Lembar>
  );
}

function KartuRekening({ r, baru, samakan, onSamakan }: { r: RingkasRekening; baru: boolean; samakan: boolean; onSamakan: (ya: boolean) => void }) {
  const angka = [
    [r.baru, "transaksi baru"],
    [r.tercatat, "sudah tercatat"],
    [r.pindah, "pindah kantong"],
    [r.perluDilengkapi, "perlu dilengkapi"],
  ] as const;
  const beda = r.saldoAplikasi !== null && Math.abs(r.saldoAplikasi - r.saldoBank) >= 0.005;
  return (
    <section className={s.blok} aria-label={r.nama}>
      <div className={s.blokIsi} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {r.bank === "jago" && !r.utama ? <Landmark size={22} aria-hidden /> : <FileText size={22} aria-hidden />}
          <div className={s.barisTeks}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{r.nama}</h3>
            <span className={s.redup}>
              {teksPeriode(r.dari, r.sampai)} · {r.baris} baris{r.berkas > 1 ? ` · ${r.berkas} berkas` : ""}
            </span>
          </div>
        </div>
        {r.namaKantong && (
          <span className={s.redup}>
            Ke {baru ? (r.utama ? "kantong baru" : "simpanan baru") : r.utama ? "kantong" : "simpanan"} {r.namaKantong}
          </span>
        )}
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 2 }}>
          {angka
            .filter(([n]) => n > 0)
            .map(([n, label]) => (
              <li key={label}>
                {n} {label}
              </li>
            ))}
          {r.barisBunga > 0 && (
            <li>
              Bunga: {r.bunga ? `${r.bunga} transaksi per bulan` : "sudah tercatat"} ({r.barisBunga} baris digabung)
            </li>
          )}
        </ul>
        {r.saldoAplikasi !== null && !beda && <span className={s.redup}>Saldo akhir menurut bank {rp(r.saldoBank)} · sama dengan aplikasi</span>}
      </div>
      {/* Saldo yang tidak sama: peringatan, dengan tawaran menyamakannya tepat di bawahnya (#4). */}
      {r.saldoAplikasi !== null && beda && (
        <Pesan jenis="peringatan" judul="Saldo akhir tidak sama">
          Menurut bank {rp(r.saldoBank)}, menurut aplikasi sesudah impor {rp(r.saldoAplikasi)}.
        </Pesan>
      )}
      {r.samakan && (
        <BarisPilih peran="checkbox" dipilih={samakan} onClick={() => onSamakan(!samakan)}>
          <span className={s.barisTeks}>
            <span style={{ whiteSpace: "normal" }}>{r.samakan.teks}</span>
          </span>
        </BarisPilih>
      )}
    </section>
  );
}
