"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarClock, CalendarDays, CreditCard, HandCoins, History, Wallet } from "lucide-react";
import { AppBar, Field, InputNominal, Kosong, Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, fmtTanggalPendek, isoLokal } from "@/lib/format";
import { emojiKantong, type Kantong } from "@/lib/kantong";
import { EMOJI_KREDIT, kantongUang, ringkasanPinjaman, type ArahPinjaman, type Cicilan } from "@/lib/pinjaman";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import BagianCicilan from "./BagianCicilan";
import FormPinjaman from "./FormPinjaman";

type KantongSaldo = Kantong & { saldo: number };

/**
 * Lend & Borrow: siapa yang utang ke aku (Lend), ke siapa aku utang dan
 * tagihan kartu kredit (Borrow), serta cicilan berjalan. Semua pinjaman
 * dicatat sebagai pindah kantong ke/dari kantong orang (SPEC-lend-borrow.md).
 */
export default function PinjamanView({
  userId,
  hariIni,
  kantong,
  cicilan,
  dibayar,
}: {
  userId: string;
  hariIni: string;
  kantong: KantongSaldo[];
  cicilan: Cicilan[];
  dibayar: Record<string, number[]>;
}) {
  const router = useRouter();
  const r = ringkasanPinjaman(kantong);
  const orang = kantong.filter((k) => k.kind === "orang");
  const uang = kantong.filter(kantongUang);
  const [form, setForm] = useState<{ arah: ArahPinjaman; pihak: KantongSaldo | null } | null>(null);
  const [aksi, setAksi] = useState<KantongSaldo | null>(null);
  const [kartuBaru, setKartuBaru] = useState(false);
  const [cicilanBaru, setCicilanBaru] = useState(false);

  const kosong = r.lend.length + r.borrow.length + r.lunas.length + r.kartu.length + cicilan.length === 0;

  /** Keterangan jatuh tempo: merah kalau sudah lewat. */
  const tempo = (k: KantongSaldo) =>
    k.jatuh_tempo ? (
      <span className={`${s.redup} ${k.jatuh_tempo < hariIni ? s.bahaya : ""}`}>
        {k.jatuh_tempo < hariIni ? "Telat sejak" : "Jatuh tempo"} {fmtTanggalPendek(k.jatuh_tempo)}
      </span>
    ) : null;

  const baris = (k: KantongSaldo, jumlah: number, ket?: React.ReactNode, kelas = "") => (
    <button key={k.id} type="button" className={`${s.baris} ${s.tekan}`} onClick={() => setAksi(k)}>
      <span className={s.barisEmoji} aria-hidden>
        {emojiKantong(k)}
      </span>
      <span className={s.barisTeks}>
        <span className={s.barisJudul}>{k.name}</span>
        {ket}
      </span>
      <span className={`${s.nominal} ${kelas}`}>{fmtIDR(jumlah)}</span>
    </button>
  );

  return (
    <>
      <AppBar
        judul="Lend & Borrow"
        sub={kosong ? "Pinjaman, kartu kredit, dan cicilan" : `Lend ${fmtIDR(r.totalLend)} · Borrow ${fmtIDR(r.totalBorrow)}`}
        kembali="/"
      />

      <div className={s.isi}>
        <div className={s.pintasan} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <Pintasan ikon={ArrowUpRight} warna="#5ecb7a" label="Pinjamkan" onClick={() => setForm({ arah: "beri", pihak: null })} />
          <Pintasan ikon={ArrowDownLeft} warna="#ff9f43" label="Pinjam" onClick={() => setForm({ arah: "pinjam", pihak: null })} />
          <Pintasan ikon={CreditCard} warna="#bf7af0" label="Kartu" onClick={() => setKartuBaru(true)} />
          <Pintasan
            ikon={CalendarClock}
            warna="#3e91ff"
            label="Cicilan"
            onClick={() => setCicilanBaru(true)}
          />
        </div>

        {kosong && (
          <div className={s.blok}>
            <Kosong ikon={HandCoins} judul="Belum ada pinjaman">
              Catat uang yang kamu pinjamkan atau pinjam, tagihan kartu kredit, dan cicilan paylater. Pinjaman tidak
              dihitung sebagai pemasukan atau pengeluaran.
            </Kosong>
          </div>
        )}

        {r.lend.length > 0 && (
          <>
            <h2 className={s.subheader}>Lend · {fmtIDR(r.totalLend)}</h2>
            <div className={s.blok}>{r.lend.map((x) => baris(x.kantong, x.jumlah, tempo(x.kantong), s.masuk))}</div>
          </>
        )}

        {(r.borrow.length > 0 || r.kartu.length > 0) && (
          <>
            <h2 className={s.subheader}>Borrow · {fmtIDR(r.totalBorrow)}</h2>
            <div className={s.blok}>
              {r.borrow.map((x) =>
                baris(x.kantong, x.jumlah, x.kantong.kind === "kredit" ? <span className={s.redup}>Tagihan kartu kredit</span> : tempo(x.kantong)),
              )}
              {r.kartu
                .filter((k) => k.saldo >= 0)
                .map((k) => baris(k, 0, <span className={s.redup}>Tidak ada tagihan</span>))}
            </div>
          </>
        )}

        <BagianCicilan
          userId={userId}
          hariIni={hariIni}
          cicilan={cicilan}
          dibayar={dibayar}
          kantong={kantong}
          baru={cicilanBaru}
          onTutupBaru={() => setCicilanBaru(false)}
        />

        {r.lunas.length > 0 && (
          <>
            <h2 className={s.subheader}>Sudah lunas</h2>
            <div className={s.blok}>{r.lunas.map((k) => baris(k, 0))}</div>
          </>
        )}
      </div>

      {aksi && (
        <Lembar judul={aksi.name} daftar onClose={() => setAksi(null)}>
          {pilihanAksi(aksi).map(({ label, ikon: Ikon, arah }) => (
            <button
              key={label}
              type="button"
              className={s.baris}
              onClick={() => {
                setAksi(null);
                if (arah) setForm({ arah, pihak: aksi });
                // Riwayat tersaring ke kantong orang/kartu ini (SPEC-riwayat-filter).
                else router.push(`/riwayat?kantong=${aksi.id}`);
              }}
            >
              <span className={s.barisIkon} aria-hidden>
                <Ikon size={20} />
              </span>
              <span className={s.barisJudul}>{label}</span>
            </button>
          ))}
        </Lembar>
      )}

      {form && (
        <FormPinjaman
          userId={userId}
          arah={form.arah}
          pihak={form.pihak}
          orang={orang}
          kantongUang={uang}
          onClose={() => setForm(null)}
        />
      )}

      {kartuBaru && <FormKartu userId={userId} onClose={() => setKartuBaru(false)} />}
    </>
  );
}

/** Aksi untuk satu orang/kartu, sesuai posisinya. */
function pilihanAksi(k: KantongSaldo): { label: string; ikon: React.ElementType; arah?: ArahPinjaman }[] {
  const riwayat = { label: "Lihat riwayat", ikon: History };
  if (k.kind === "kredit") return [{ label: "Bayar tagihan", ikon: Banknote, arah: "bayar" }, riwayat];
  if (k.saldo > 0)
    return [
      { label: "Terima bayaran", ikon: ArrowDownLeft, arah: "terima_bayar" },
      { label: "Pinjamkan lagi", ikon: ArrowUpRight, arah: "beri" },
      riwayat,
    ];
  if (k.saldo < 0)
    return [
      { label: "Bayar", ikon: Banknote, arah: "bayar" },
      { label: "Pinjam lagi", ikon: ArrowDownLeft, arah: "pinjam" },
      riwayat,
    ];
  return [
    { label: "Pinjamkan", ikon: ArrowUpRight, arah: "beri" },
    { label: "Pinjam", ikon: ArrowDownLeft, arah: "pinjam" },
    riwayat,
  ];
}

function Pintasan({ ikon: Ikon, warna, label, onClick }: { ikon: React.ElementType; warna: string; label: string; onClick: () => void }) {
  return (
    <button type="button" className={s.tekan} onClick={onClick}>
      <span style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
        <Ikon size={22} />
      </span>
      {label}
    </button>
  );
}

/** Tambah kartu kredit: kantong berjenis kredit, tagihan sekarang = saldo awal negatif. */
function FormKartu({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const [nama, setNama] = useState("Kartu kredit");
  const [tagihan, setTagihan] = useState("");
  const [per, setPer] = useState(isoLokal(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    const n = nama.trim().replace(/\s+/g, " ");
    if (!n) return setError("Namanya diisi dulu.");
    setLoading(true);
    const { error: err } = await createSupabaseBrowserClient()
      .from("user_accounts")
      .insert({ user_id: userId, name: n, kind: "kredit", emoji: EMOJI_KREDIT, saldo_awal: -Number(tagihan || 0), saldo_per: per });
    setLoading(false);
    if (err) return setError(dbErrorMessage(err, `Kantong "${n}"`));
    onClose();
    router.refresh();
  }

  return (
    <Lembar
      judul="Tambah kartu kredit"
      posisi="penuh"
      isian={[nama, tagihan, per]}
      onClose={() => !loading && onClose()}
      pil={[
        { label: "Batal", batal: true, disabled: loading },
        { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
      ]}
    >
      <form onSubmit={simpan} className={s.form}>
        <div className={`${s.blok} ${s.blokForm}`}>
          <Field label="Nama" ikon={Wallet}>
            <input required maxLength={40} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama" />
          </Field>
          <Field label="Tagihan sekarang (Rp)" ikon={Banknote} keterangan="Kosongkan kalau belum ada tagihan.">
            <InputNominal value={tagihan} onChange={setTagihan} placeholder="Tagihan sekarang (Rp)" />
          </Field>
          <Field label="Per tanggal" ikon={CalendarDays}>
            <input type="date" required value={per} onChange={(e) => setPer(e.target.value)} />
          </Field>
        </div>
        <p className={s.redup} style={{ margin: "0 20px" }}>
          Belanja pakai kartu dicatat seperti biasa dengan kantong kartu ini; bayar tagihan lewat Lend & Borrow.
        </p>
        {error && <Pesan jenis="bahaya">{error}</Pesan>}
        <button type="submit" hidden />
      </form>
    </Lembar>
  );
}
