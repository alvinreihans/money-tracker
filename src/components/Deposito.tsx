"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, BadgeCheck, Pencil } from "lucide-react";
import { Field, InputNominal, Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, isianNominal, isoLokal } from "@/lib/format";
import {
  argumenTutup,
  fmtPersen,
  menungguCek,
  NAMA_PERPANJANGAN,
  pajakBerlaku,
  periodeAktif,
  selisihHari,
  teksSelisih,
  tglPanjang,
  tglPendek,
  type InfoDeposito,
  type PeriodeDeposito,
} from "@/lib/simpanan";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Aksi deposito (SPEC-simpanan §5): evaluasi jatuh tempo ("Sesuai" / "Isi
 * yang diterima") dan Cairkan sekarang. Semuanya lewat RPC
 * tutup_periode_deposito, satu transaksi database.
 */
function useTutup(selesai: (hasil: string) => void) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function tutup(info: InfoDeposito, p: PeriodeDeposito, bunga: number, cairkan: boolean) {
    setLoading(true);
    setGalat(null);
    const hariIni = isoLokal(new Date());
    const arg = argumenTutup(info.d, info.periode, p, bunga, cairkan, hariIni);
    const { data: sisa, error } = await createSupabaseBrowserClient().rpc("tutup_periode_deposito", arg);
    setLoading(false);
    if (error) return setGalat(dbErrorMessage(error));

    // Yang terjadi, ditulis: selisih dengan perhitungan, lalu ke mana uangnya.
    const selisih = cairkan && hariIni < p.jatuh_tempo ? (bunga > 0 ? `Bunga ${fmtIDR(bunga)} masuk ke ${info.induk}.` : "") : teksSelisih(bunga, Number(p.bunga_bersih));
    const lanjut = arg.p_baru
      ? info.d.perpanjangan === "pokok_bunga"
        ? `Bunganya ditambahkan ke pokok: ${fmtIDR(arg.p_baru.pokok)} sampai ${tglPanjang(arg.p_baru.jatuh_tempo)}.`
        : `Bunganya masuk ke ${info.induk}; ${fmtIDR(arg.p_baru.pokok)} diperpanjang sampai ${tglPanjang(arg.p_baru.jatuh_tempo)}.`
      : `${fmtIDR(Number(sisa ?? 0))} kembali ke ${info.induk}. ${info.name} selesai.`;
    selesai(`${info.name}: ${[selisih, lanjut].filter(Boolean).join(" ")}`);
    router.refresh();
  }
  return { tutup, loading, galat };
}

/** Isian nominal bunga bersih yang diterima, untuk "Isi yang diterima", Cairkan sekarang, dan hapus deposito. */
export function LembarBunga({
  judul,
  awal,
  keterangan,
  ya,
  loading,
  galat,
  onBatal,
  onYa,
}: {
  judul: string;
  awal: number;
  keterangan: React.ReactNode;
  ya: string;
  loading: boolean;
  galat: string | null;
  onBatal: () => void;
  onYa: (bunga: number) => void;
}) {
  const [nilai, setNilai] = useState(isianNominal(awal) || "0");
  const [salah, setSalah] = useState<string | null>(null);
  const kirim = () => {
    const n = Number(nilai || 0);
    if (!Number.isFinite(n) || n < 0) return setSalah("Isi nominalnya, boleh Rp 0.");
    onYa(Math.round(n));
  };
  return (
    <Lembar
      judul={judul}
      onClose={() => !loading && onBatal()}
      tombol={
        <>
          <button type="button" className={`${s.flat} ${s.flatNetral}`} disabled={loading} onClick={onBatal}>
            Batal
          </button>
          <span className={s.pilPemisah} aria-hidden />
          <button type="button" className={`${s.flat} ${s.flatNetral}`} disabled={loading} onClick={kirim}>
            {loading ? <Spinner /> : ya}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          kirim();
        }}
      >
        <Field label="Bunga bersih diterima (Rp)" ikon={Banknote} galat={salah} keterangan={keterangan}>
          <InputNominal data-autofocus value={nilai} onChange={setNilai} placeholder="Bunga bersih diterima (Rp)" />
        </Field>
        <button type="submit" hidden />
      </form>
      {galat && (
        <div style={{ marginTop: 12 }}>
          <Pesan jenis="bahaya">{galat}</Pesan>
        </div>
      )}
    </Lembar>
  );
}

const estimasi = (p: PeriodeDeposito) =>
  `Perkiraan bunga ${fmtIDR(Number(p.bunga_kotor))} − pajak ${fmtIDR(Number(p.pajak))} = bersih ${fmtIDR(Number(p.bunga_bersih))}`;

/** Evaluasi satu periode yang jatuh tempo: Sesuai / Isi yang diterima. */
function Evaluasi({ info, p, onHasil }: { info: InfoDeposito; p: PeriodeDeposito; onHasil: (teks: string) => void }) {
  const [isi, setIsi] = useState(false);
  const { tutup, loading, galat } = useTutup((teks) => {
    setIsi(false);
    onHasil(teks);
  });
  return (
    <>
      <div className={s.baris} style={{ alignItems: "flex-start" }}>
        <span className={s.barisEmoji} aria-hidden>
          {info.emoji || "🏦"}
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>
            {info.name} · di {info.induk}
          </span>
          <span className={s.redup} style={{ whiteSpace: "normal" }}>
            Jatuh tempo {tglPendek(p.jatuh_tempo)} · pokok {fmtIDR(Number(p.pokok))}
          </span>
          <span className={s.redup} style={{ whiteSpace: "normal" }}>
            {estimasi(p)}
          </span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "0 20px 16px", flexWrap: "wrap" }}>
        <button type="button" className={s.tombol} disabled={loading} onClick={() => void tutup(info, p, Number(p.bunga_bersih), false)}>
          {loading && !isi ? <Spinner /> : "Sesuai"}
        </button>
        <button type="button" className={`${s.tombol} ${s.tombolSekunder}`} disabled={loading} onClick={() => setIsi(true)}>
          Isi yang diterima
        </button>
      </div>
      {galat && !isi && (
        <div style={{ padding: "0 20px 16px" }}>
          <Pesan jenis="bahaya">{galat}</Pesan>
        </div>
      )}
      {isi && (
        <LembarBunga
          judul={`Bunga ${info.name}`}
          awal={Number(p.bunga_bersih)}
          keterangan={`Lihat di aplikasi ${info.induk}. ${estimasi(p)}.`}
          ya="Simpan"
          loading={loading}
          galat={galat}
          onBatal={() => setIsi(false)}
          onYa={(b) => void tutup(info, p, b, false)}
        />
      )}
    </>
  );
}

/**
 * Kartu "Deposito jatuh tempo" di Beranda: bertahan sampai bunganya dicek.
 * Hasilnya (selisih dengan perhitungan) tetap tampil sesudah kartunya habis.
 */
export function KartuDeposito({ data }: { data: InfoDeposito[] }) {
  const [hasil, setHasil] = useState<string[]>([]);
  const hariIni = isoLokal(new Date());
  const tunggu = data.flatMap((info) => info.periode.filter((p) => menungguCek(p, hariIni)).map((p) => ({ info, p })));
  if (tunggu.length === 0 && hasil.length === 0) return null;
  return (
    <section className={s.blok}>
      <div className={s.blokIsi} style={{ paddingBottom: 4 }}>
        <h2 className={s.blokJudul}>Deposito jatuh tempo</h2>
        {tunggu.length > 0 && <p className={s.blokSub}>Cek bunga yang diterima di aplikasi bank, baru dicatat.</p>}
      </div>
      {tunggu.map(({ info, p }) => (
        <Evaluasi key={p.id} info={info} p={p} onHasil={(t) => setHasil((h) => [...h, t])} />
      ))}
      {hasil.map((t, i) => (
        <div key={i} style={{ padding: "0 20px 16px" }}>
          <Pesan jenis="sukses">{t}</Pesan>
        </div>
      ))}
    </section>
  );
}

/** Detail satu deposito di Profil → Kantong: periode berjalan, aksi, dan riwayat periode. */
export function DetailDeposito({ info, onUbah, onClose }: { info: InfoDeposito; onUbah: () => void; onClose: () => void }) {
  const hariIni = isoLokal(new Date());
  const aktif = periodeAktif(info.periode, info.id);
  const tunggu = aktif && menungguCek(aktif, hariIni) ? aktif : null;
  const [cair, setCair] = useState(false);
  const [hasil, setHasil] = useState<string | null>(null);
  const { tutup, loading, galat } = useTutup((t) => {
    setCair(false);
    setHasil(t);
  });
  const riwayat = info.periode.filter((p) => p.bunga_diterima != null || p.dicairkan_awal).reverse();

  return (
    <Lembar judul={info.name} sub={`${fmtIDR(info.saldo)} · di ${info.induk}`} daftar onClose={onClose}>
      {hasil ? (
        <div style={{ padding: "8px 20px 16px" }}>
          <Pesan jenis="sukses">{hasil}</Pesan>
        </div>
      ) : (
        <>
          {aktif && (
            <div className={s.baris} style={{ alignItems: "flex-start" }}>
              <span className={s.barisTeks}>
                <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>
                  Periode ke-{aktif.ke}: {tglPendek(aktif.mulai)} – {tglPanjang(aktif.jatuh_tempo)} ({selisihHari(aktif.mulai, aktif.jatuh_tempo)} hari)
                </span>
                <span className={s.redup} style={{ whiteSpace: "normal" }}>
                  Pokok {fmtIDR(Number(aktif.pokok))} · {fmtPersen(info.d.bunga_persen)}%/th · pajak {fmtPersen(pajakBerlaku(info.d, Number(aktif.pokok)))}%
                </span>
                <span className={s.redup} style={{ whiteSpace: "normal" }}>
                  {estimasi(aktif)}
                </span>
                <span className={s.redup}>{NAMA_PERPANJANGAN[info.d.perpanjangan]}</span>
              </span>
            </div>
          )}
          {tunggu && <Evaluasi info={info} p={tunggu} onHasil={setHasil} />}
          {aktif && (
            <button type="button" className={s.baris} onClick={() => setCair(true)}>
              <span className={s.barisIkon} aria-hidden>
                <Banknote size={20} />
              </span>
              <span className={s.barisJudul}>Cairkan sekarang</span>
            </button>
          )}
          <button type="button" className={s.baris} onClick={onUbah}>
            <span className={s.barisIkon} aria-hidden>
              <Pencil size={20} />
            </span>
            <span className={s.barisJudul}>Ubah</span>
          </button>
          {riwayat.length > 0 && (
            <>
              <h3 className={s.subheader} style={{ marginTop: 16 }}>
                Riwayat periode
              </h3>
              {riwayat.map((p) => (
                <div key={p.id} className={s.baris} style={{ alignItems: "flex-start" }}>
                  <span className={s.barisIkon} aria-hidden>
                    <BadgeCheck size={20} />
                  </span>
                  <span className={s.barisTeks}>
                    <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>
                      Ke-{p.ke} · {tglPendek(p.mulai)} – {tglPanjang(p.jatuh_tempo)}
                    </span>
                    <span className={s.redup} style={{ whiteSpace: "normal" }}>
                      {p.dicairkan_awal
                        ? `Dicairkan sebelum jatuh tempo · bunga ${fmtIDR(Number(p.bunga_diterima ?? 0))}`
                        : `Perkiraan ${fmtIDR(Number(p.bunga_bersih))} · ${teksSelisih(Number(p.bunga_diterima), Number(p.bunga_bersih))}`}
                    </span>
                  </span>
                </div>
              ))}
            </>
          )}
        </>
      )}
      {cair && aktif && (
        <LembarBunga
          judul={`Cairkan ${info.name}?`}
          awal={0}
          keterangan={`Pencairan sebelum jatuh tempo biasanya tanpa bunga. ${fmtIDR(info.saldo)} kembali ke ${info.induk}, lalu deposito ini selesai.`}
          ya="Cairkan"
          loading={loading}
          galat={galat}
          onBatal={() => setCair(false)}
          onYa={(b) => void tutup(info, aktif, b, true)}
        />
      )}
    </Lembar>
  );
}
