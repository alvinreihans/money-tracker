"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Banknote, CalendarClock, CalendarDays, CreditCard, HandCoins, History, Pencil, Percent, Trash2, Wallet } from "lucide-react";
import { AppBar, Field, InputNominal, Konfirmasi, Kosong, Lembar, Pesan, Spinner, useGalat } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, fmtTanggalPendek, isoLokal } from "@/lib/format";
import { emojiKantong, pesanGagalKantong, type Kantong } from "@/lib/kantong";
import {
  bacaBunga,
  bacaJatuhTempoHari,
  daftarUtang,
  dampakHapusPihak,
  EMOJI_KREDIT,
  jatuhTempoKartu,
  kantongSumber,
  ringkasanPinjaman,
  type ArahPinjaman,
  type Cicilan,
  type StrategiUtang,
} from "@/lib/pinjaman";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { saldoSejakDari } from "@/lib/waktu";
import BagianCicilan from "./BagianCicilan";
import BagianStrategi, { AturBunga, type SasaranBunga } from "./BagianStrategi";
import FormPinjaman from "./FormPinjaman";

type KantongSaldo = Kantong & { saldo: number };

/**
 * Lend & Borrow: siapa yang utang ke aku (Lend), ke siapa aku utang dan
 * tagihan kartu kredit (Borrow), serta cicilan berjalan. Semua pinjaman
 * dicatat sebagai pindah kantong ke/dari kantong orang (docs/specs/SPEC-lend-borrow.md).
 */
export default function PinjamanView({
  userId,
  hariIni,
  kantong,
  cicilan,
  dibayar,
  strategi,
  ekstra,
}: {
  userId: string;
  hariIni: string;
  kantong: KantongSaldo[];
  cicilan: Cicilan[];
  dibayar: Record<string, number[]>;
  /** Strategi pelunasan (SPEC-pelunasan); null = belum memilih. */
  strategi: StrategiUtang | null;
  ekstra: number | null;
}) {
  const router = useRouter();
  const r = ringkasanPinjaman(kantong);
  const orang = kantong.filter((k) => k.kind === "orang");
  // Sumber uang tanpa tujuan tabungan (SPEC-perbaikan-temuan C6).
  const uang = kantong.filter(kantongSumber);
  const [form, setForm] = useState<{ arah: ArahPinjaman; pihak: KantongSaldo | null } | null>(null);
  const [aksi, setAksi] = useState<KantongSaldo | null>(null);
  /** Form kartu: `true` = tambah, kantong = ubah kartu itu. */
  const [kartu, setKartu] = useState<KantongSaldo | true | null>(null);
  const [hapus, setHapus] = useState<{ k: KantongSaldo; transaksi: number | null } | null>(null);
  const [menghapus, setMenghapus] = useState(false);
  const [galatHapus, setGalatHapus] = useState<string | null>(null);
  const [cicilanBaru, setCicilanBaru] = useState(false);
  const [bunga, setBunga] = useState<SasaranBunga | null>(null);
  const utang = daftarUtang(kantong, cicilan, dibayar, hariIni);

  /** Hapus orang/kartu (SPEC-perbaikan-temuan C2): konfirmasi menyebut akibatnya, termasuk jumlah transaksinya. */
  async function bukaHapus(k: KantongSaldo) {
    setGalatHapus(null);
    setHapus({ k, transaksi: null });
    const { count } = await createSupabaseBrowserClient()
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .or(`kantong_id.eq.${k.id},kantong_tujuan_id.eq.${k.id}`);
    setHapus((h) => (h?.k.id === k.id ? { k, transaksi: count ?? 0 } : h));
  }

  // Transaksinya tetap, lepas dari kantong ini (FK on delete set null + trigger kantong_dihapus).
  async function jalankanHapus() {
    if (!hapus) return;
    setMenghapus(true);
    const { error: err } = await createSupabaseBrowserClient().from("user_accounts").delete().eq("id", hapus.k.id);
    setMenghapus(false);
    if (err) return setGalatHapus(dbErrorMessage(err));
    setHapus(null);
    router.refresh();
  }

  /** Keterangan baris kartu kredit + jatuh tempo berikutnya bila diisi (juga tanpa tagihan). */
  const ketKartu = (k: KantongSaldo, teks = "Tagihan kartu kredit") => (
    <span className={s.redup}>
      {teks}
      {k.jatuh_tempo_hari ? ` · jatuh tempo ${fmtTanggalPendek(jatuhTempoKartu(k.jatuh_tempo_hari, hariIni))}` : ""}
    </span>
  );

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
        judul="Utang & Piutang"
        sub={kosong ? "Pinjaman, kartu kredit, dan cicilan" : `Utang ${fmtIDR(r.totalBorrow)} · Piutang ${fmtIDR(r.totalLend)}`}
        kembali="/"
      />

      <div className={`${s.isi} ${s.ketBungkus}`}>
        <div className={s.pintasan} style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <Pintasan ikon={ArrowUpRight} warna="#5ecb7a" label="Pinjamkan" onClick={() => setForm({ arah: "beri", pihak: null })} />
          <Pintasan ikon={ArrowDownLeft} warna="#ff9f43" label="Pinjam" onClick={() => setForm({ arah: "pinjam", pihak: null })} />
          <Pintasan ikon={CreditCard} warna="#bf7af0" label="Kartu" onClick={() => setKartu(true)} />
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
            <h2 className={s.subheader}>Piutang · {fmtIDR(r.totalLend)}</h2>
            <div className={s.blok}>{r.lend.map((x) => baris(x.kantong, x.jumlah, tempo(x.kantong), s.masuk))}</div>
          </>
        )}

        {(r.borrow.length > 0 || r.kartu.length > 0) && (
          <>
            <h2 className={s.subheader}>Utang · {fmtIDR(r.totalBorrow)}</h2>
            <div className={s.blok}>
              {r.borrow.map((x) => baris(x.kantong, x.jumlah, x.kantong.kind === "kredit" ? ketKartu(x.kantong) : tempo(x.kantong)))}
              {/* Kelebihan bayar: tampil di sini, tidak menambah total Utang (SPEC-perbaikan-temuan C1). */}
              {r.lebihBayar.map((x) => baris(x.kantong, x.jumlah, ketKartu(x.kantong, "Kelebihan bayar"), s.masuk))}
              {r.kartu
                .filter((k) => k.saldo === 0)
                .map((k) => baris(k, 0, ketKartu(k, "Tidak ada tagihan")))}
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

        <BagianStrategi
          userId={userId}
          utang={utang}
          strategi={strategi}
          ekstra={ekstra}
          onAturBunga={(u) => setBunga({ tabel: u.jenis === "cicilan" ? "cicilan" : "user_accounts", id: u.id, nama: u.nama, bunga: u.bunga })}
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
          {pilihanAksi(aksi).map(({ label, ikon: Ikon, arah, bunga: aturBunga, ubah, hapus: aksiHapus }) => (
            <button
              key={label}
              type="button"
              className={s.baris}
              onClick={() => {
                setAksi(null);
                if (ubah) setKartu(aksi);
                else if (aksiHapus) void bukaHapus(aksi);
                else if (aturBunga) setBunga({ tabel: "user_accounts", id: aksi.id, nama: aksi.name, bunga: aksi.bunga_persen == null ? null : Number(aksi.bunga_persen) });
                else if (arah) setForm({ arah, pihak: aksi });
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

      {kartu && <FormKartu userId={userId} asal={kartu === true ? null : kartu} onClose={() => setKartu(null)} />}
      {hapus && (
        <Konfirmasi
          tanya={hapus.k.kind === "kredit" ? `Hapus kartu “${hapus.k.name}”?` : `Hapus “${hapus.k.name}”?`}
          ya="Hapus"
          loading={menghapus || hapus.transaksi === null}
          error={galatHapus}
          onBatal={() => setHapus(null)}
          onYa={() => void jalankanHapus()}
        >
          {hapus.transaksi === null
            ? "Menghitung transaksinya…"
            : dampakHapusPihak(hapus.k, hapus.transaksi, cicilan.filter((c) => c.kantong_id === hapus.k.id).length).join(" ") ||
              `Belum ada transaksi dengan ${hapus.k.name}.`}
        </Konfirmasi>
      )}
      {bunga && <AturBunga sasaran={bunga} onClose={() => setBunga(null)} />}
    </>
  );
}

/**
 * Aksi untuk satu orang/kartu, sesuai posisinya. Atur bunga: hanya yang
 * kuutangi (SPEC-pelunasan). Hapus selalu ada, paling bawah (SPEC-perbaikan-temuan C2).
 */
function pilihanAksi(k: KantongSaldo): { label: string; ikon: React.ElementType; arah?: ArahPinjaman; bunga?: true; ubah?: true; hapus?: true }[] {
  const riwayat = { label: "Lihat riwayat", ikon: History };
  const bunga = { label: "Atur bunga", ikon: Percent, bunga: true as const };
  const hapus = { label: "Hapus", ikon: Trash2, hapus: true as const };
  if (k.kind === "kredit")
    return [{ label: "Bayar tagihan", ikon: Banknote, arah: "bayar" }, { label: "Ubah kartu", ikon: Pencil, ubah: true }, bunga, riwayat, hapus];
  if (k.saldo > 0)
    return [
      { label: "Terima bayaran", ikon: ArrowDownLeft, arah: "terima_bayar" },
      { label: "Pinjamkan lagi", ikon: ArrowUpRight, arah: "beri" },
      riwayat,
      hapus,
    ];
  if (k.saldo < 0)
    return [
      { label: "Bayar", ikon: Banknote, arah: "bayar" },
      { label: "Pinjam lagi", ikon: ArrowDownLeft, arah: "pinjam" },
      bunga,
      riwayat,
      hapus,
    ];
  return [
    { label: "Pinjamkan", ikon: ArrowUpRight, arah: "beri" },
    { label: "Pinjam", ikon: ArrowDownLeft, arah: "pinjam" },
    riwayat,
    hapus,
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

/**
 * Tambah / ubah kartu kredit: kantong berjenis kredit, tagihan sekarang =
 * saldo awal negatif (hanya saat tambah). Saldo berlaku sejak jam sekarang bila
 * per hari ini, 00.00 bila tanggal lain (SPEC-saldo-waktu). Jatuh tempo tiap
 * tanggal untuk pengingat tagihan (SPEC-perbaikan-temuan C9, C10).
 */
function FormKartu({ userId, asal, onClose }: { userId: string; asal: KantongSaldo | null; onClose: () => void }) {
  const router = useRouter();
  const [nama, setNama] = useState(asal?.name ?? "Kartu kredit");
  const [tagihan, setTagihan] = useState("");
  const [per, setPer] = useState(isoLokal(new Date()));
  const [jatuhTempo, setJatuhTempo] = useState(asal?.jatuh_tempo_hari ? String(asal.jatuh_tempo_hari) : "");
  const [bunga, setBunga] = useState(asal?.bunga_persen == null ? "" : String(Number(asal.bunga_persen)).replace(".", ","));
  const [loading, setLoading] = useState(false);
  const { galat, gagal } = useGalat({ nama, bunga, jatuh_tempo: jatuhTempo });

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    const n = nama.trim().replace(/\s+/g, " ");
    if (!n) return gagal("Namanya diisi dulu.", "nama");
    const jt = bacaJatuhTempoHari(jatuhTempo);
    if (!jt.ok) return gagal(jt.error, "jatuh_tempo");
    const b = bacaBunga(bunga);
    if (!b.ok) return gagal(b.error, "bunga");
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const tabel = db.from("user_accounts");
    const data = { name: n, jatuh_tempo_hari: jt.nilai, bunga_persen: b.nilai };
    const { error: err } = asal
      ? await tabel.update(data).eq("id", asal.id)
      : await tabel.insert({
          ...data,
          user_id: userId,
          kind: "kredit",
          emoji: EMOJI_KREDIT,
          saldo_awal: -Number(tagihan || 0),
          saldo_per: per,
          saldo_sejak: saldoSejakDari(per),
        });
    if (err) {
      const pesan = await pesanGagalKantong(db, err, n, asal?.id ?? null, dbErrorMessage(err, `Kantong "${n}"`));
      setLoading(false);
      return gagal(pesan, err.code === "23505" ? "nama" : undefined);
    }
    setLoading(false);
    onClose();
    router.refresh();
  }

  return (
    <Lembar
      judul={asal ? "Ubah kartu kredit" : "Tambah kartu kredit"}
      posisi="penuh"
      isian={[nama, tagihan, per, jatuhTempo, bunga]}
      onClose={() => !loading && onClose()}
      pil={[
        { label: "Batal", batal: true, disabled: loading },
        { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
      ]}
    >
      <form onSubmit={simpan} className={s.form}>
        <div className={`${s.blok} ${s.blokForm}`}>
          <Field label="Nama" ikon={Wallet} galat={galat?.kolom === "nama" ? galat.pesan : null} kolom="nama">
            <input required maxLength={40} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama" />
          </Field>
          {!asal && (
            <>
              <Field label="Tagihan sekarang (Rp)" ikon={Banknote} keterangan="Kosongkan kalau belum ada tagihan.">
                <InputNominal value={tagihan} onChange={setTagihan} placeholder="Tagihan sekarang (Rp)" />
              </Field>
              <Field label="Per tanggal" ikon={CalendarDays}>
                <input type="date" required value={per} onChange={(e) => setPer(e.target.value)} />
              </Field>
            </>
          )}
          <Field
            label="Jatuh tempo tiap tanggal"
            ikon={CalendarClock}
            galat={galat?.kolom === "jatuh_tempo" ? galat.pesan : null}
            kolom="jatuh_tempo"
            keterangan="Opsional, 1–31. Diingatkan sehari sebelumnya bila ada tagihan."
          >
            <input
              inputMode="numeric"
              value={jatuhTempo}
              onChange={(e) => setJatuhTempo(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="Jatuh tempo tiap tanggal"
            />
          </Field>
          <Field label="Bunga per bulan (%)" ikon={Percent} galat={galat?.kolom === "bunga" ? galat.pesan : null} kolom="bunga" keterangan="Opsional, mis. 1,75. Dipakai untuk urutan Avalanche.">
            <input inputMode="decimal" value={bunga} onChange={(e) => setBunga(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))} placeholder="Bunga per bulan (%)" />
          </Field>
        </div>
        <p className={s.redup} style={{ margin: "0 20px" }}>
          Belanja pakai kartu dicatat seperti biasa dengan kantong kartu ini; bayar tagihan lewat Utang & Piutang.
        </p>
        {galat && !galat.kolom && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}
        <button type="submit" hidden />
      </form>
    </Lembar>
  );
}
