"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, Landmark, Percent, Plus } from "lucide-react";
import { useCatat } from "@/components/Catat";
import { BarisPilih, Field, InputNominal, Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR } from "@/lib/format";
import type { IsianJadikan, Pilihan, Ragu, RingkasRekening, TawaranDeposito, TawaranJadikan, TawaranKantong } from "@/lib/rekening/rencana";
import { ubahKecuali, type BarisRincian, type RincianRekening } from "@/lib/rekening/rincian";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { bacaPersen, CHIP_TENOR, KET_PERPANJANGAN, NAMA_PERPANJANGAN, type Perpanjangan, type SatuanTenor } from "@/lib/simpanan";

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
  tawaranJadikan: TawaranJadikan[];
  tawaranKantong?: TawaranKantong[];
  ragu: Ragu[];
  pilihanKantong: { id: string; name: string; kind: string; emoji: string | null }[];
  bank: Record<string, string>;
  /** Rincian per baris yang bisa dicentang (SPEC-periksa-dulu §3). */
  rincian?: RincianRekening[];
}

/** Kantong yang dibuat di tempat saat impor, ditanya saldonya sesudahnya (SPEC-kantong-sendiri K1). */
interface KantongTanya {
  id: string;
  name: string;
  kind: string;
  emoji: string;
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
  const { periksaPindah } = useCatat();
  const [pilihan, setPilihan] = useState<Pilihan>({});
  const [data, setData] = useState<Pratinjau | null>(null);
  const [galat, setGalat] = useState<{ nama?: string; pesan: string }[] | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [mengimpor, setMengimpor] = useState(false);
  // Jawaban "kantong yang mana?" yang belum dikirim.
  const [jawab, setJawab] = useState<Record<string, string>>({});
  // Sesudah impor: kabar + kantong baru yang ditanya saldonya (K1).
  const [selesai, setSelesai] = useState<{ kabar: string; kantong: KantongTanya[] } | null>(null);
  const [saldo, setSaldo] = useState<Record<string, string>>({});
  const [galatSaldo, setGalatSaldo] = useState<string | null>(null);
  // Rekening yang rinciannya sedang dibuka (SPEC-periksa-dulu §3).
  const [rincianBuka, setRincianBuka] = useState<string | null>(null);
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
    const h = (d.hasil ?? {}) as { transaksi?: number; tautan?: number; deposito?: number };
    const bagian = [
      `${h.transaksi ?? 0} transaksi baru`,
      h.tautan ? `${h.tautan} ditautkan ke yang sudah tercatat` : null,
      h.deposito ? `${h.deposito} jatuh tempo deposito dicocokkan` : null,
    ].filter(Boolean);
    const kabar = `Rekening koran diimpor: ${bagian.join(", ")}.`;
    const tanyaSaldo = (Array.isArray(d.tanyaSaldo) ? d.tanyaSaldo : []) as KantongTanya[];
    // Kantong uang baru: transaksi rekening koran lama yang pindah ke/dari situ ditawarkan sesudah lembar ini tutup (A-3).
    const periksa = (Array.isArray(d.periksaPindah) ? d.periksaPindah : []).filter((x): x is string => typeof x === "string");
    if (periksa.length) periksaPindah(periksa);
    router.refresh();
    if (tanyaSaldo.length) return setSelesai({ kabar, kantong: tanyaSaldo });
    onSelesai(kabar);
  }

  /**
   * "Saldo DANA sekarang berapa?" (K1): saldo per sekarang (saldo_sejak = sekarang), pola
   * layar awal. Kantong utang paylater diisi utangnya (disimpan minus). Kosong = dilewati.
   */
  async function simpanSaldo() {
    if (!selesai) return;
    setMengimpor(true);
    setGalatSaldo(null);
    const db = createSupabaseBrowserClient().from("user_accounts");
    for (const k of selesai.kantong) {
      const isian = saldo[k.id];
      if (!isian) continue;
      const n = Number(isian);
      const { error } = await db.update({ saldo_awal: k.kind === "kredit" ? -Math.abs(n) : n, saldo_sejak: new Date().toISOString() }).eq("id", k.id);
      if (error) {
        setMengimpor(false);
        return setGalatSaldo(dbErrorMessage(error));
      }
    }
    setMengimpor(false);
    router.refresh();
    onSelesai(selesai.kabar);
  }

  const tanya = data?.belumDipetakan.filter((r) => r.utama) ?? [];
  const tampil = (data?.rekening ?? []).filter((r) => r.kantong || r.baris > 0 || r.saldoBank !== 0);
  const sibuk = memuat || mengimpor;

  let isi: React.ReactNode;
  if (selesai) {
    const satu = selesai.kantong.length === 1 ? selesai.kantong[0] : null;
    isi = (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Pesan jenis="sukses">{selesai.kabar}</Pesan>
        <section className={`${s.blok} ${s.blokForm}`} aria-labelledby="saldo-baru-judul">
          <h3 id="saldo-baru-judul" className={s.judulBagian} style={{ paddingBottom: 4 }}>
            {satu ? (satu.kind === "kredit" ? `Utang ${satu.name} sekarang berapa?` : `Saldo ${satu.name} sekarang berapa?`) : "Saldo kantong baru sekarang berapa?"}
          </h3>
          <p className={s.redup} style={{ margin: 0, padding: "0 20px 8px" }}>
            Kantongnya baru dibuat dari rekening koran, mulai Rp 0. Isi saldonya sekarang supaya Total aset benar. Boleh dilewati.
          </p>
          {selesai.kantong.map((k) => (
            <Field key={k.id} label={k.kind === "kredit" ? `${k.emoji} Utang ${k.name}` : `${k.emoji} ${k.name}`} galat={galatSaldo} awalan="Rp">
              <InputNominal value={saldo[k.id] ?? ""} onChange={(v) => setSaldo((x) => ({ ...x, [k.id]: v }))} placeholder="0" />
            </Field>
          ))}
        </section>
      </div>
    );
  } else if (galat) {
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
        {tampil.map((r) => {
          const rinci = data.rincian?.find((x) => x.kunci === r.kunci);
          return (
            <KartuRekening
              key={r.kunci}
              r={r}
              baru={data.kantongBaru.some((k) => k.kunci === r.kantong)}
              samakan={Boolean(pilihan.samakan?.includes(r.kunci))}
              onSamakan={(ya) => ubah({ samakan: ya ? [...(pilihan.samakan ?? []), r.kunci] : (pilihan.samakan ?? []).filter((k) => k !== r.kunci) })}
              rincian={rinci ? { n: rinci.baris.length, tidak: rinci.baris.filter((b) => b.refs.some((x) => pilihan.kecuali?.includes(x))).length } : null}
              onRincian={() => setRincianBuka(r.kunci)}
            />
          );
        })}
        {/* Kantong e-wallet/bank/paylater sendiri yang belum ada (SPEC-kantong-sendiri A-2, D-3): tercentang. */}
        {(data.tawaranKantong ?? []).map((t) => (
          <div key={t.kunci} className={s.blok}>
            <BarisPilih
              peran="checkbox"
              dipilih={t.dipilih}
              onClick={() => ubah({ tolakKantong: t.dipilih ? [...(pilihan.tolakKantong ?? []), t.kunci] : (pilihan.tolakKantong ?? []).filter((k) => k !== t.kunci) })}
            >
              <span className={s.barisEmoji} aria-hidden>
                {t.kind === "ewallet" ? "📱" : t.kind === "kredit" ? "💳" : "🏦"}
              </span>
              <span className={s.barisTeks}>
                <span style={{ whiteSpace: "normal" }}>{t.teks}</span>
                <span className={s.redup} style={{ whiteSpace: "normal" }}>
                  {t.dipilih ? "Dicatat sebagai pindah kantong, bukan pengeluaran." : "Tetap dicatat sebagai pengeluaran/pemasukan."}
                </span>
              </span>
            </BarisPilih>
          </div>
        ))}
        {(data.tawaranJadikan ?? []).map((t) => (
          <KartuJadikan
            key={t.kunci}
            t={t}
            onTerapkan={(isian) => {
              const lain = Object.fromEntries(Object.entries(pilihan.jadikan ?? {}).filter(([k]) => k !== t.kunci));
              ubah({ jadikan: isian ? { ...lain, [t.kunci]: isian } : lain });
            }}
          />
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

  const pil = selesai
    ? [
        { label: "Lewati", disabled: mengimpor, onClick: () => onSelesai(selesai.kabar) },
        { label: mengimpor ? <Spinner /> : "Simpan", disabled: mengimpor, onClick: () => void simpanSaldo() },
      ]
    : galat
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

  const rinciBuka = rincianBuka ? data?.rincian?.find((x) => x.kunci === rincianBuka) : null;
  const ringkasBuka = rincianBuka ? data?.rekening.find((x) => x.kunci === rincianBuka) : null;

  return (
    <Lembar judul="Impor rekening koran" posisi="penuh" onClose={() => !mengimpor && (selesai ? onSelesai(selesai.kabar) : onClose())} pil={pil}>
      <div aria-busy={sibuk} style={{ opacity: memuat && data ? 0.6 : 1, transition: "opacity .2s" }}>
        {isi}
      </div>
      {rinciBuka && ringkasBuka && (
        <LembarRincian
          rek={rinciBuka}
          ringkas={ringkasBuka}
          kecuali={pilihan.kecuali ?? []}
          memuat={memuat}
          onUbah={(b, centang) => ubah({ kecuali: ubahKecuali(pilihan.kecuali ?? [], b.refs, centang) })}
          onClose={() => setRincianBuka(null)}
        />
      )}
    </Lembar>
  );
}

/**
 * Rincian satu rekening (SPEC-periksa-dulu §3): yang perlu perhatian di atas,
 * baris biasa dilipat per tanggal. Tiap baris bisa dicentang/tidak (bawaan:
 * tercentang); yang tidak dicentang tidak diimpor dan saldo menurut aplikasi
 * dihitung ulang tanpa baris itu.
 */
function LembarRincian({
  rek,
  ringkas,
  kecuali,
  memuat,
  onUbah,
  onClose,
}: {
  rek: RincianRekening;
  ringkas: RingkasRekening;
  kecuali: string[];
  memuat: boolean;
  onUbah: (b: BarisRincian, centang: boolean) => void;
  onClose: () => void;
}) {
  const perhatian = rek.baris.filter((b) => b.perhatian);
  const biasa = rek.baris.filter((b) => !b.perhatian);
  const perTanggal = [...new Set(biasa.map((b) => b.tanggal))].sort().map((t) => [t, biasa.filter((b) => b.tanggal === t)] as const);
  const dicentang = (b: BarisRincian) => !b.refs.some((x) => kecuali.includes(x));
  const beda = ringkas.saldoAplikasi !== null && Math.abs(ringkas.saldoAplikasi - ringkas.saldoBank) >= 0.005;
  const baris = (b: BarisRincian, tanggal: boolean) => {
    const isi = (
      <>
        <span className={s.barisTeks}>
          <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>
            {b.judul}
          </span>
          <span className={s.redup} style={{ whiteSpace: "normal" }}>
            {[tanggal ? teksPeriode(b.tanggal, b.tanggal) : null, b.label].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className={s.nominal} style={{ fontSize: 15 }}>
          {rp(b.nominal)}
        </span>
      </>
    );
    return b.refs.length ? (
      <BarisPilih key={b.kunci} peran="checkbox" dipilih={dicentang(b)} onClick={() => !memuat && onUbah(b, !dicentang(b))}>
        {isi}
      </BarisPilih>
    ) : (
      <div key={b.kunci} className={s.baris}>
        {isi}
      </div>
    );
  };
  return (
    <Lembar judul={`Rincian ${rek.nama}`} sub={`${rek.baris.length} baris · yang tidak dicentang tidak diimpor`} posisi="penuh" onClose={onClose} pil={[{ label: "Selesai", onClick: onClose }]}>
      <div aria-busy={memuat} style={{ display: "flex", flexDirection: "column", gap: 16, opacity: memuat ? 0.6 : 1, transition: "opacity .2s" }}>
        {ringkas.saldoAplikasi !== null &&
          (beda ? (
            <Pesan jenis="peringatan" judul="Saldo akhir tidak sama">
              Menurut bank {rp(ringkas.saldoBank)}, menurut aplikasi sesudah impor {rp(ringkas.saldoAplikasi)}.
            </Pesan>
          ) : (
            <span className={s.redup}>
              Saldo akhir menurut aplikasi {rp(ringkas.saldoAplikasi)} · sama dengan bank
            </span>
          ))}
        {perhatian.length > 0 && (
          <section className={s.blok} aria-labelledby="rincian-perhatian">
            <h3 id="rincian-perhatian" className={s.judulBagian}>
              Perlu perhatian ({perhatian.length})
            </h3>
            {perhatian.map((b) => baris(b, true))}
          </section>
        )}
        {perTanggal.length > 0 && (
          <section className={s.blok} aria-labelledby="rincian-lain">
            <h3 id="rincian-lain" className={s.judulBagian}>
              Lainnya ({biasa.length})
            </h3>
            {perTanggal.map(([t, isi]) => (
              <details key={t} className={s.lipatan}>
                <summary>
                  <span>
                    {teksPeriode(t, t)} · {isi.length} baris
                    {isi.some((b) => !dicentang(b)) ? ` · ${isi.filter((b) => !dicentang(b)).length} tidak diimpor` : ""}
                  </span>
                </summary>
                {isi.map((b) => baris(b, false))}
              </details>
            ))}
          </section>
        )}
      </div>
    </Lembar>
  );
}

function KartuRekening({
  r,
  baru,
  samakan,
  onSamakan,
  rincian,
  onRincian,
}: {
  r: RingkasRekening;
  baru: boolean;
  samakan: boolean;
  onSamakan: (ya: boolean) => void;
  /** Jumlah baris di rincian & yang tidak dicentang (SPEC-periksa-dulu §3). */
  rincian: { n: number; tidak: number } | null;
  onRincian: () => void;
}) {
  const angka = [
    // "· 2 berkategori dari bulan lalu" (ingat kategori, SPEC-kantong-sendiri C-1).
    [r.baru, `transaksi baru${r.dariIngatan ? ` · ${r.dariIngatan} berkategori dari bulan lalu` : ""}`],
    [r.cicilan ?? 0, "dibayar ke rencana cicilan"],
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
          {(r.diubahPindah ?? []).map((x) => (
            <li key={x.nama}>
              {x.n} transaksi di {x.nama} diubah jadi pindah kantong
            </li>
          ))}
          {r.barisBunga > 0 && (
            <li>
              Bunga: {r.bunga ? `${r.bunga} transaksi per bulan` : "sudah tercatat"} ({r.barisBunga} baris digabung)
            </li>
          )}
        </ul>
        {/* Deposito jatuh tempo (SPEC-deposito-jatuh-tempo): yang sesuai perkiraan cukup satu baris. */}
        {(r.deposito ?? [])
          .filter((d) => !d.peringatan)
          .map((d) => (
            <span key={d.teks} className={s.redup} style={{ whiteSpace: "normal" }}>
              {d.teks}
            </span>
          ))}
        {/* U1: kantong yang dibuat di tempat menerima rekening koran pertamanya. */}
        {r.saldoDariRekening && <span className={s.redup}>Saldo awal {r.namaKantong ?? r.nama} diambil dari rekening koran ini</span>}
        {r.saldoAplikasi !== null && !beda && <span className={s.redup}>Saldo akhir menurut bank {rp(r.saldoBank)} · sama dengan aplikasi</span>}
      </div>
      {/* Bunga beda dengan perkiraan/isian: peringatan (pola SPEC-perbaikan-uiux #3). */}
      {(r.deposito ?? [])
        .filter((d) => d.peringatan)
        .map((d) => (
          <Pesan key={d.teks} jenis="peringatan" judul={d.judul ?? "Bunga deposito beda dengan perkiraan"}>
            {d.teks}
          </Pesan>
        ))}
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
      {rincian && (
        <button type="button" className={`${s.baris} ${s.tekan}`} onClick={onRincian}>
          <span className={s.barisTeks}>
            <span className={s.barisJudul} style={{ color: "var(--primer)" }}>
              Lihat rincian ({rincian.n} baris)
            </span>
            {rincian.tidak > 0 && <span className={s.redup}>{rincian.tidak} tidak dicentang, tidak diimpor</span>}
          </span>
        </button>
      )}
    </section>
  );
}

/**
 * "Jadikan deposito?" untuk kantong Jago bernama Deposito (SPEC-deposito-jatuh-tempo
 * K2): rekening koran Jago tidak memuat tenor & bunganya, jadi diisi di sini.
 * Tanggal mulai & pokok dari baris Penempatan Dana. Tidak dicentang = tetap tabungan.
 */
function KartuJadikan({ t, onTerapkan }: { t: TawaranJadikan; onTerapkan: (isian: IsianJadikan | null) => void }) {
  const [buka, setBuka] = useState(Boolean(t.isian));
  const [bunga, setBunga] = useState(t.isian ? String(t.isian.bunga_persen).replace(".", ",") : "");
  const [tenor, setTenor] = useState<{ tenor: number; satuan: SatuanTenor }>({ tenor: t.isian?.tenor ?? 1, satuan: t.isian?.satuan_tenor ?? "bulan" });
  const [perpanjangan, setPerpanjangan] = useState<Perpanjangan>(t.isian?.perpanjangan ?? "pokok_bunga");
  const [mulai, setMulai] = useState(t.isian?.mulai ?? "");
  const terapkan = () =>
    onTerapkan({ tenor: tenor.tenor, satuan_tenor: tenor.satuan, bunga_persen: bacaPersen(bunga) || 0, perpanjangan, ...(t.mulai ? {} : { mulai }) });
  return (
    <section className={s.blok} aria-label={`${t.teks} Kantong Jago ${t.name}`}>
      <BarisPilih
        peran="checkbox"
        dipilih={buka}
        onClick={() => {
          setBuka(!buka);
          if (buka && t.isian) onTerapkan(null);
        }}
      >
        <span className={s.barisEmoji} aria-hidden>
          💰
        </span>
        <span className={s.barisTeks}>
          <span style={{ whiteSpace: "normal" }}>{t.teks}</span>
          <span className={s.redup} style={{ whiteSpace: "normal" }}>
            Kantong Jago “{t.name}” · {t.mulai ? `penempatan ${teksPeriode(t.mulai, t.mulai)}${t.pokok ? ` ${fmtIDR(t.pokok)}` : ""} · ` : ""}
            Isi tenor & bunganya supaya jatuh temponya dicocokkan.
          </span>
        </span>
      </BarisPilih>
      {buka && (
        <form
          style={{ paddingBottom: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            terapkan();
          }}
        >
          <Field label="Bunga per tahun (%)" ikon={Percent} galat={t.isian ? t.galat : null}>
            <input inputMode="decimal" value={bunga} onChange={(e) => setBunga(e.target.value)} placeholder="Bunga per tahun (%)" />
          </Field>
          <div className={`${s.chipsBungkus} ${s.sisipForm}`} role="group" aria-label="Tenor">
            {CHIP_TENOR.map((c) => (
              <button
                key={c.label}
                type="button"
                className={s.chip}
                aria-pressed={c.tenor === tenor.tenor && c.satuan === tenor.satuan}
                onClick={() => setTenor({ tenor: c.tenor, satuan: c.satuan })}
              >
                {c.label}
              </button>
            ))}
          </div>
          {!t.mulai && (
            <Field label="Tanggal mulai" ikon={CalendarDays}>
              <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} aria-label="Tanggal mulai" />
            </Field>
          )}
          <div role="radiogroup" aria-label="Saat jatuh tempo">
            {(Object.keys(NAMA_PERPANJANGAN) as Perpanjangan[]).map((id) => (
              <BarisPilih key={id} peran="radio" dipilih={perpanjangan === id} onClick={() => setPerpanjangan(id)}>
                <span className={s.barisTeks}>
                  <span className={s.barisJudul}>{NAMA_PERPANJANGAN[id]}</span>
                  <span className={s.redup} style={{ whiteSpace: "normal" }}>
                    {KET_PERPANJANGAN[id]}
                  </span>
                </span>
              </BarisPilih>
            ))}
          </div>
          <div style={{ padding: "8px 20px 0" }}>
            <button type="submit" className={s.tombol}>
              {t.isian ? "Perbarui" : "Jadikan deposito"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
