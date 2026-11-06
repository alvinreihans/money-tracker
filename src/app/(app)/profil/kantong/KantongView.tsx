"use client";

import { useState, type FormEvent } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CalendarDays, Clock, Landmark, Percent, Plus, Repeat, Smile, Wallet } from "lucide-react";
import { DetailDeposito, LembarBunga } from "@/components/Deposito";
import { AppBar, Field, GalatForm, InputNominal, Konfirmasi, Kosong, Lembar, Pesan, Pilih, Segmen, Spinner, useGalat } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, isianNominal, isoLokal } from "@/lib/format";
import { ambilEmoji, emojiKantong, pesanGagalKantong, SARAN_EMOJI_KANTONG, type Kantong } from "@/lib/kantong";
import {
  argumenTutup,
  bisaInduk,
  CHIP_TENOR,
  fmtPersen,
  KET_PERPANJANGAN,
  NAMA_PERPANJANGAN,
  pajakBawaan,
  pajakBerlaku,
  patokanDeposito,
  periodeAktif,
  periodeDeposito,
  susunKantong,
  teksDeposito,
  teksPratinjau,
  validasiDeposito,
  type InfoDeposito,
  type MacamSimpanan,
  type Perpanjangan,
  type SatuanTenor,
} from "@/lib/simpanan";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validasiKantong } from "@/lib/transaksi-input";
import { fmtJam, jamWIB, saldoSejakDari } from "@/lib/waktu";

type KantongSaldo = Kantong & { saldo: number };

interface Isian {
  /** Kantong biasa atau simpanan (SPEC-simpanan); hanya dipilih saat menambah. */
  jenis: "kantong" | "simpanan";
  name: string;
  emoji: string;
  saldo_awal: string;
  saldo_per: string;
  // Simpanan
  induk_id: string;
  macam: MacamSimpanan;
  termasuk: "ya" | "tidak";
  // Deposito
  bunga: string;
  tenor: string;
  satuan: SatuanTenor;
  mulai: string;
  perpanjangan: Perpanjangan;
  pajak: string;
  /** Pajak diubah user: tidak lagi mengikuti pokok (0% sampai Rp 7,5 jt). */
  pajakDiubah: boolean;
}

const EMOJI_SIMPANAN: Record<MacamSimpanan, string> = { tabungan: "🐷", deposito: "💰" };

/**
 * Daftar kantong (rekening, e-wallet, tunai) dan saldonya sekarang. Tiap
 * kantong punya saldo awal per tanggal tertentu; transaksi sejak tanggal itu
 * yang tertaut ke kantongnya menggeser saldonya.
 *
 * Bank atau e-wallet tidak perlu dibedakan — tidak ada hitungan yang
 * bergantung padanya — jadi penandanya cukup emoji pilihan user. Satu-satunya
 * kantong tunai adalah "Tunai" bawaan, yang tidak bisa dihapus.
 *
 * Simpanan (deposito, pocket) berada di dalam kantong lain: baris induknya
 * menampilkan saldo gabungan + rincian, simpanannya menjorok di bawahnya
 * (SPEC-simpanan).
 */
/** Sejak kapan saldo yang diisi berlaku, dalam kalimat. */
function keteranganSaldo(tanggal: string, asal?: Kantong): string {
  if (asal?.saldo_sejak && asal.saldo_per === tanggal && jamWIB(asal.saldo_sejak) !== "00:00") {
    return `Saldo per jam ${fmtJam(jamWIB(asal.saldo_sejak))} di tanggal ini. Transaksi sesudahnya ikut menggeser saldonya.`;
  }
  return tanggal === isoLokal(new Date())
    ? "Saldo saat ini (jam sekarang). Transaksi sesudahnya ikut menggeser saldonya."
    : "Saldo di awal tanggal ini. Transaksi mulai tanggal ini ikut menggeser saldonya.";
}

export default function KantongView({
  userId,
  daftar,
  deposito,
  total,
  disisihkan,
}: {
  userId: string;
  /** Kantong uang (termasuk simpanan & tujuan) beserta saldonya; deposito selesai tidak. */
  daftar: KantongSaldo[];
  /** Deposito yang masih berjalan, untuk detail & aksinya. */
  deposito: InfoDeposito[];
  /** Total aset: tiap kantong uang dihitung sekali. */
  total: number;
  /**
   * Tujuan tabungan (SPEC-tujuan-tabungan): jumlahnya, saldo yang terpisah
   * (null = semua disimpan di kantong lain, nominal tidak ditampilkan), dan
   * keterangan tempatnya (SPEC-simpanan U3).
   */
  disisihkan: { jumlah: number; total: number | null; keterangan: string };
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ asal: KantongSaldo | null; isian: Isian } | null>(null);
  const [detail, setDetail] = useState<InfoDeposito | null>(null);
  const [yakinHapus, setYakinHapus] = useState(false);
  const [loading, setLoading] = useState(false);
  const { galat, gagal, bersihkan } = useGalat(edit?.isian);
  const hariIni = isoLokal(new Date());

  // Tujuan yang terpisah tampil di baris "Disisihkan ke tujuan"; yang disimpan di kantong lain ikut gabungannya.
  const baris = susunKantong(daftar).filter((b) => b.k.kind !== "tujuan");
  const induk = daftar.filter(bisaInduk);
  const namaInduk = (id: string | null | undefined) => daftar.find((k) => k.id === id)?.name ?? "";
  const infoDari = (id: string) => deposito.find((d) => d.id === id) ?? null;

  function buka(k?: KantongSaldo) {
    bersihkan();
    setYakinHapus(false);
    setDetail(null);
    const info = k ? infoDari(k.id) : null;
    const aktif = info ? periodeAktif(info.periode, info.id) : null;
    setEdit({
      asal: k ?? null,
      isian: {
        jenis: k?.kind === "simpanan" ? "simpanan" : "kantong",
        name: k?.name ?? "",
        emoji: k ? emojiKantong(k) : SARAN_EMOJI_KANTONG[0],
        saldo_awal: k ? isianNominal(k.saldo_awal) : "",
        saldo_per: k?.saldo_per ?? hariIni,
        induk_id: k?.induk_id ?? induk[0]?.id ?? "",
        macam: k?.macam_simpanan ?? "tabungan",
        termasuk: "ya",
        bunga: info ? fmtPersen(info.d.bunga_persen) : "",
        tenor: info ? String(info.d.tenor) : "1",
        satuan: info?.d.satuan_tenor ?? "bulan",
        mulai: aktif?.mulai ?? hariIni,
        perpanjangan: info?.d.perpanjangan ?? "sekali",
        pajak: info ? fmtPersen(pajakBerlaku(info.d, Number(aktif?.pokok ?? 0))) : "0",
        pajakDiubah: info?.d.pajak_otomatis === false,
      },
    });
  }

  function tutup() {
    if (!loading) setEdit(null);
  }

  const ubah = (p: Partial<Isian>) =>
    setEdit((v) => {
      if (!v) return v;
      const isian = { ...v.isian, ...p };
      // Pajak bawaan mengikuti pokok (periode berjalan, atau pokok yang diisi) sampai diubah sendiri.
      const aktif = v.asal ? periodeAktif(infoDari(v.asal.id)?.periode ?? [], v.asal.id) : null;
      if (!isian.pajakDiubah) isian.pajak = String(pajakBawaan(aktif ? Number(aktif.pokok) : Number(isian.saldo_awal || 0)));
      return { ...v, isian };
    });

  const isian = edit?.isian;
  const simpanan = isian?.jenis === "simpanan";
  const depo = simpanan && isian?.macam === "deposito";
  const infoEdit = edit?.asal ? infoDari(edit.asal.id) : null;
  const aktifEdit = infoEdit ? periodeAktif(infoEdit.periode, infoEdit.id) : null;
  // Pratinjau deposito: periode berjalan (ubah) atau periode ke-1 (baru).
  const cekDepo = depo && isian ? validasiDeposito(isian) : null;
  const pokokPratinjau = aktifEdit ? Number(aktifEdit.pokok) : Number(isian?.saldo_awal || 0);
  const pratinjau =
    cekDepo?.ok && pokokPratinjau > 0
      ? periodeDeposito({ ...cekDepo.data, pajak_otomatis: !isian?.pajakDiubah }, cekDepo.data.mulai, pokokPratinjau, aktifEdit && aktifEdit.ke > 1 ? patokanDeposito(infoEdit!.periode) : undefined)
      : null;

  async function simpanSimpanan(i: Isian) {
    const asal = edit?.asal ?? null;
    const dasar = validasiKantong({ name: i.name, emoji: i.emoji, saldo_awal: asal ? "0" : i.saldo_awal, saldo_per: hariIni });
    if (!dasar.ok) return gagal(dasar.error, dasar.kolom);
    if (dasar.data.saldo_awal < 0) return gagal("Saldonya tidak boleh minus.", "saldo_awal");
    if (!asal && !i.induk_id) return gagal("Pilih kantong tempat simpanan ini berada.", "induk_id");
    const d = i.macam === "deposito" ? validasiDeposito(i) : null;
    if (d && !d.ok) return gagal(d.error, d.kolom);
    if (d && !asal && dasar.data.saldo_awal <= 0) return gagal("Pokok depositonya diisi dulu.", "saldo_awal");
    const aturan = d?.ok ? { bunga_persen: d.data.bunga_persen, tenor: d.data.tenor, satuan_tenor: d.data.satuan_tenor, pajak_persen: d.data.pajak_persen, pajak_otomatis: !i.pajakDiubah, perpanjangan: i.perpanjangan } : null;

    setLoading(true);
    const db = createSupabaseBrowserClient();
    let err: { code?: string; message: string } | null = null;
    if (!asal) {
      const p = d?.ok && aturan ? periodeDeposito(aturan, d.data.mulai, dasar.data.saldo_awal) : null;
      ({ error: err } = await db.rpc("buat_simpanan", {
        p_kantong: { name: dasar.data.name, emoji: dasar.data.emoji, induk_id: i.induk_id, macam_simpanan: i.macam, saldo: dasar.data.saldo_awal },
        p_termasuk: i.termasuk === "ya",
        p_deposito: aturan,
        p_periode: p && { mulai: p.mulai, jatuh_tempo: p.jatuh_tempo, bunga_kotor: p.bunga_kotor, pajak: p.pajak, bunga_bersih: p.bunga_bersih },
      }));
    } else {
      ({ error: err } = await db.from("user_accounts").update({ name: dasar.data.name, emoji: dasar.data.emoji }).eq("id", asal.id));
      // Aturan deposito berubah: perkiraan periode yang sedang berjalan dihitung ulang (pokoknya tetap).
      if (!err && aturan && infoEdit) {
        ({ error: err } = await db.from("deposito").update(aturan).eq("kantong_id", asal.id));
        if (!err && aktifEdit && d?.ok) {
          const mulai = aktifEdit.ke === 1 ? d.data.mulai : aktifEdit.mulai;
          const p = periodeDeposito(aturan, mulai, Number(aktifEdit.pokok), aktifEdit.ke > 1 ? patokanDeposito(infoEdit.periode) : undefined);
          ({ error: err } = await db
            .from("deposito_periode")
            .update({ mulai: p.mulai, jatuh_tempo: p.jatuh_tempo, bunga_kotor: p.bunga_kotor, pajak: p.pajak, bunga_bersih: p.bunga_bersih })
            .eq("id", aktifEdit.id));
        }
      }
    }
    const pesan = err ? await pesanGagalKantong(db, err, dasar.data.name, asal?.id ?? null, dbErrorMessage(err, `Simpanan "${dasar.data.name}"`)) : null;
    setLoading(false);
    if (err) return gagal(pesan!, err.code === "23505" ? "name" : undefined);
    setEdit(null);
    router.refresh();
  }

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    if (!edit) return;
    bersihkan();
    if (edit.isian.jenis === "simpanan") return simpanSimpanan(edit.isian);
    const cek = validasiKantong({ ...edit.isian });
    if (!cek.ok) return gagal(cek.error, cek.kolom);

    // Saldo berlaku sejak (SPEC-saldo-waktu): diisi hari ini → jam sekarang;
    // tanggal lain → awal hari itu. Tidak diubah kalau tanggal & nominalnya tetap.
    const asal = edit.asal ?? undefined;
    const baruSaldo =
      !asal ||
      asal.saldo_per !== cek.data.saldo_per ||
      (cek.data.saldo_per === hariIni && Number(asal.saldo_awal) !== cek.data.saldo_awal);
    const data = baruSaldo ? { ...cek.data, saldo_sejak: saldoSejakDari(cek.data.saldo_per) } : cek.data;

    setLoading(true);
    const db = createSupabaseBrowserClient();
    const tabel = db.from("user_accounts");
    const { error: err } = asal ? await tabel.update(data).eq("id", asal.id) : await tabel.insert({ ...data, user_id: userId });

    // Nama kembar (tanpa beda huruf): sebut di mana nama itu dipakai (SPEC-perbaikan-temuan C4).
    const pesan = err ? await pesanGagalKantong(db, err, cek.data.name, asal?.id ?? null, dbErrorMessage(err, `Kantong "${cek.data.name}"`)) : null;
    setLoading(false);
    if (err) return gagal(pesan!, err.code === "23505" ? "name" : undefined);
    setEdit(null);
    router.refresh();
  }

  // Isi kantong yang akan dihapus: simpanan menahan penghapusan, tujuan dilepas.
  const isiAsal = edit?.asal ? daftar.filter((k) => k.induk_id === edit.asal!.id) : [];
  const simpananAsal = isiAsal.filter((k) => k.kind === "simpanan");
  const tujuanAsal = isiAsal.filter((k) => k.kind === "tujuan");

  function mintaHapus() {
    if (!edit?.asal) return;
    if (simpananAsal.length > 0) {
      return gagal(`${edit.asal.name} masih berisi ${simpananAsal.length} simpanan. Cairkan atau hapus simpanannya dulu.`);
    }
    bersihkan();
    setYakinHapus(true);
  }

  /**
   * Deposito yang masih berjalan dihapus seperti Cairkan sekarang lalu hapus
   * (SPEC-simpanan §6): bunga yang diterima (bawaan Rp 0) dicatat ke induk.
   */
  async function hapus(bunga = 0) {
    if (!edit?.asal) return;
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const keterangan = infoEdit && aktifEdit ? argumenTutup(infoEdit.d, infoEdit.periode, aktifEdit, bunga, true, hariIni).p_keterangan : null;
    const { error: err } =
      edit.asal.kind === "simpanan"
        ? await db.rpc("hapus_simpanan", { p_id: edit.asal.id, p_bunga: bunga, p_keterangan: keterangan })
        : await db.from("user_accounts").delete().eq("id", edit.asal.id);
    setLoading(false);

    if (err) return gagal(dbErrorMessage(err));
    setEdit(null);
    router.refresh();
  }

  /** Keterangan baris yang menjorok di bawah induknya. */
  const ketIsi = (k: KantongSaldo) => {
    if (k.kind === "tujuan") return "Tujuan tabungan";
    const info = infoDari(k.id);
    if (info) return teksDeposito(info.d, periodeAktif(info.periode, info.id), hariIni);
    return "Tabungan/pocket";
  };

  const tekanIsi = (k: KantongSaldo) => {
    const info = infoDari(k.id);
    if (info) return setDetail(info);
    if (k.kind === "tujuan") return router.push("/profil/tujuan");
    buka(k);
  };

  const ketHapus = (k: KantongSaldo) => {
    if (k.kind === "simpanan") {
      return k.saldo > 0 ? `${fmtIDR(k.saldo)} kembali ke ${namaInduk(k.induk_id)}, lalu simpanan ini dihapus.` : "Simpanan ini dihapus.";
    }
    const lepas = tujuanAsal.length ? ` Tujuan ${tujuanAsal.map((t) => t.name).join(", ")} yang disimpan di sini jadi terpisah.` : "";
    return `Transaksinya tetap ada, cuma lepas dari kantong ini dan nggak ikut saldo.${lepas}`;
  };

  return (
    <>
      <AppBar
        judul="Kantong"
        sub={daftar.length > 0 ? `Total aset ${fmtIDR(total)}` : "Rekening, e-wallet, dan tunai"}
        kembali="/profil"
        aksi={
          <button type="button" className={s.ikonTombol} aria-label="Tambah kantong" onClick={() => buka()}>
            <Plus size={24} />
          </button>
        }
      />

      <div className={s.isi}>
        {baris.length > 0 ? (
          <>
            <div className={s.blok}>
              {baris.map((b) => (
                <div key={b.k.id}>
                  <button type="button" className={`${s.baris} ${s.tekan}`} onClick={() => buka({ ...b.k, saldo: b.sendiri })}>
                    <span className={s.barisEmoji} aria-hidden>
                      {emojiKantong(b.k)}
                    </span>
                    <span className={s.barisTeks}>
                      <span className={s.barisJudul}>{b.k.name}</span>
                      {b.rincian && (
                        <span className={s.redup} style={{ whiteSpace: "normal" }}>
                          {b.rincian}
                        </span>
                      )}
                    </span>
                    <span className={`${s.nominal} ${b.saldo < 0 ? s.bahaya : ""}`}>{fmtIDR(b.saldo)}</span>
                  </button>
                  {b.isi.map((k) => (
                    <button key={k.id} type="button" className={`${s.baris} ${s.tekan}`} style={{ paddingLeft: 56 }} onClick={() => tekanIsi(k)}>
                      <span className={s.barisEmoji} aria-hidden>
                        {emojiKantong(k)}
                      </span>
                      <span className={s.barisTeks}>
                        <span className={s.barisJudul}>{k.name}</span>
                        <span className={s.redup} style={{ whiteSpace: "normal" }}>
                          {ketIsi(k)}
                        </span>
                      </span>
                      <span className={`${s.nominal} ${k.saldo < 0 ? s.bahaya : ""}`}>{fmtIDR(k.saldo)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {disisihkan.jumlah > 0 && (
              <div className={s.blok}>
                <NextLink href="/profil/tujuan" className={`${s.baris} ${s.tekan}`} style={{ color: "inherit" }}>
                  <span className={s.barisEmoji} aria-hidden>
                    🎯
                  </span>
                  {/* Dibungkus, tidak dipotong, di panel sempit (SPEC-perbaikan-temuan C11). */}
                  <span className={s.barisTeks}>
                    <span className={s.barisJudul} style={{ whiteSpace: "normal" }}>
                      Disisihkan ke tujuan
                    </span>
                    <span className={s.redup} style={{ whiteSpace: "normal" }}>
                      {disisihkan.keterangan}
                    </span>
                  </span>
                  {disisihkan.total != null && <span className={s.nominal}>{fmtIDR(disisihkan.total)}</span>}
                </NextLink>
              </div>
            )}
          </>
        ) : (
          <div className={s.blok}>
            <Kosong ikon={Wallet} judul="Belum ada kantong">
              Tambahkan rekening atau e-wallet, lengkap dengan saldonya sekarang.
              <br />
              <button type="button" className={s.tombol} style={{ marginTop: 16 }} onClick={() => buka()}>
                Tambah kantong
              </button>
            </Kosong>
          </div>
        )}
      </div>

      {detail && <DetailDeposito info={detail} onClose={() => setDetail(null)} onUbah={() => buka(daftar.find((k) => k.id === detail.id))} />}

      {edit && isian && (
        <Lembar
          judul={edit.asal ? (simpanan ? "Ubah simpanan" : "Ubah kantong") : "Tambah kantong"}
          posisi="penuh"
          isian={edit.isian}
          onClose={tutup}
          pil={[
            { label: "Batal", batal: true, disabled: loading },
            { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
          ]}
        >
          <form onSubmit={simpan} className={s.form}>
            <div className={s.kategoriPratinjau} aria-hidden>
              <span className={`${s.barisEmoji} ${s.emojiBesar}`}>{isian.emoji}</span>
              <strong>{isian.name.trim() || (simpanan ? "Nama simpanan" : "Nama kantong")}</strong>
            </div>

            {!edit.asal && (
              <Segmen
                label="Jenis kantong"
                pilihan={[
                  { id: "kantong", label: "Kantong" },
                  { id: "simpanan", label: "Simpanan" },
                ]}
                nilai={isian.jenis}
                onChange={(jenis) =>
                  ubah({
                    jenis,
                    // Emoji bawaan ikut jenisnya, selama belum dipilih sendiri.
                    ...([SARAN_EMOJI_KANTONG[0], ...Object.values(EMOJI_SIMPANAN)].includes(isian.emoji)
                      ? { emoji: jenis === "simpanan" ? EMOJI_SIMPANAN[isian.macam] : SARAN_EMOJI_KANTONG[0] }
                      : {}),
                  })
                }
              />
            )}

            <GalatForm value={galat}>
              <div className={`${s.blok} ${s.blokForm}`}>
                <Field label="Nama" ikon={Wallet} kolom="name">
                  <input required maxLength={40} value={isian.name} onChange={(e) => ubah({ name: e.target.value })} placeholder="Nama" />
                </Field>
                <Field label="Emoji" ikon={Smile} keterangan="Pilih di bawah, atau ketik emoji lain dari keyboard." kolom="emoji">
                  <input
                    value={isian.emoji}
                    // Yang tersimpan cukup satu emoji: ambil yang terakhir diketik.
                    onChange={(e) => {
                      const emoji = ambilEmoji(e.target.value);
                      if (emoji) ubah({ emoji });
                    }}
                    placeholder="Emoji"
                    aria-label="Emoji kantong"
                  />
                </Field>
                <div className={s.gridEmoji} role="radiogroup" aria-label="Pilihan emoji">
                  {SARAN_EMOJI_KANTONG.map((emoji) => (
                    <button key={emoji} type="button" role="radio" aria-checked={isian.emoji === emoji} aria-label={emoji} onClick={() => ubah({ emoji })}>
                      {emoji}
                    </button>
                  ))}
                </div>

                {!simpanan ? (
                  <>
                    <Field label="Saldo awal (Rp)" ikon={Banknote} kolom="saldo_awal">
                      <InputNominal bolehMinus value={isian.saldo_awal} onChange={(saldo_awal) => ubah({ saldo_awal })} placeholder="Saldo awal (Rp)" />
                    </Field>
                    <Field label="Saldo per tanggal" ikon={CalendarDays} kolom="saldo_per" keterangan={keteranganSaldo(isian.saldo_per, edit.asal ?? undefined)}>
                      <input type="date" required value={isian.saldo_per} onChange={(e) => ubah({ saldo_per: e.target.value })} />
                    </Field>
                  </>
                ) : edit.asal ? (
                  <p className={s.redup} style={{ margin: "8px 0 0" }}>
                    Di dalam {namaInduk(edit.asal.induk_id)} · saldo {fmtIDR(edit.asal.saldo)}. Saldonya berubah lewat pindah kantong
                    {depo ? ", jatuh tempo, atau Cairkan sekarang." : "."}
                  </p>
                ) : (
                  <>
                    <Pilih
                      label="Di dalam"
                      ikon={Landmark}
                      kolom="induk_id"
                      nilai={isian.induk_id}
                      kosong="Pilih kantong"
                      pilihan={induk.map((k) => ({ id: k.id, label: k.name, emoji: emojiKantong(k) }))}
                      onChange={(induk_id) => ubah({ induk_id })}
                    />
                    <Segmen
                      label="Macam simpanan"
                      pilihan={[
                        { id: "tabungan", label: "Tabungan/pocket" },
                        { id: "deposito", label: "Deposito" },
                      ]}
                      nilai={isian.macam}
                      onChange={(macam) => ubah({ macam, ...(Object.values(EMOJI_SIMPANAN).includes(isian.emoji) ? { emoji: EMOJI_SIMPANAN[macam] } : {}) })}
                    />
                    <Field label={depo ? "Pokok (Rp)" : "Saldo (Rp)"} ikon={Banknote} kolom="saldo_awal">
                      <InputNominal value={isian.saldo_awal} onChange={(saldo_awal) => ubah({ saldo_awal })} placeholder={depo ? "Pokok (Rp)" : "Saldo (Rp)"} />
                    </Field>
                    <div style={{ padding: "12px 0 4px" }}>
                      <p className={s.redup} style={{ margin: "0 0 8px" }}>
                        Sudah termasuk di saldo {namaInduk(isian.induk_id) || "kantong itu"}?
                      </p>
                      <Segmen
                        label={`Sudah termasuk di saldo ${namaInduk(isian.induk_id)}?`}
                        pilihan={[
                          { id: "ya", label: "Ya, sudah" },
                          { id: "tidak", label: "Belum, uang baru" },
                        ]}
                        nilai={isian.termasuk}
                        onChange={(termasuk) => ubah({ termasuk })}
                      />
                      <p className={s.redup} style={{ margin: "8px 0 0", fontSize: 14 }}>
                        {isian.termasuk === "ya"
                          ? `Dicatat pindah dari ${namaInduk(isian.induk_id) || "kantong itu"} ke simpanan ini; saldo gabungannya tetap.`
                          : "Ditambahkan sebagai saldo awal; saldo gabungannya naik."}
                      </p>
                    </div>
                  </>
                )}

                {depo && (
                  <>
                    <Field label="Bunga per tahun (%)" ikon={Percent} kolom="bunga">
                      <input inputMode="decimal" value={isian.bunga} onChange={(e) => ubah({ bunga: e.target.value })} placeholder="Bunga per tahun (%)" />
                    </Field>
                    <div className={s.chipsBungkus} role="group" aria-label="Tenor" style={{ padding: "12px 0 0" }}>
                      {CHIP_TENOR.map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          className={s.chip}
                          aria-pressed={String(c.tenor) === isian.tenor && c.satuan === isian.satuan}
                          onClick={() => ubah({ tenor: String(c.tenor), satuan: c.satuan })}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <Field label="Tenor" ikon={Clock} kolom="tenor">
                      <input inputMode="numeric" value={isian.tenor} onChange={(e) => ubah({ tenor: e.target.value.replace(/\D/g, "") })} placeholder="Tenor" />
                    </Field>
                    <Segmen
                      label="Satuan tenor"
                      pilihan={[
                        { id: "hari", label: "Hari" },
                        { id: "bulan", label: "Bulan" },
                      ]}
                      nilai={isian.satuan}
                      onChange={(satuan) => ubah({ satuan })}
                    />
                    {(!aktifEdit || aktifEdit.ke === 1) && (
                      <Field label="Tanggal mulai" ikon={CalendarDays} kolom="mulai">
                        <input type="date" required value={isian.mulai} onChange={(e) => ubah({ mulai: e.target.value })} aria-label="Tanggal mulai" />
                      </Field>
                    )}
                    <Pilih
                      label="Saat jatuh tempo"
                      ikon={Repeat}
                      kolom="perpanjangan"
                      nilai={isian.perpanjangan}
                      pilihan={(Object.keys(NAMA_PERPANJANGAN) as Perpanjangan[]).map((id) => ({ id, label: NAMA_PERPANJANGAN[id] }))}
                      onChange={(perpanjangan) => ubah({ perpanjangan })}
                    />
                    <p className={s.redup} style={{ margin: "4px 0 0 46px", fontSize: 14 }}>
                      {KET_PERPANJANGAN[isian.perpanjangan]}
                    </p>
                    <Field label="Pajak bunga (%)" ikon={Percent} kolom="pajak" keterangan="PPh final 20%, 0% bila pokok sampai Rp 7.500.000.">
                      <input inputMode="decimal" value={isian.pajak} onChange={(e) => ubah({ pajak: e.target.value, pajakDiubah: true })} placeholder="Pajak bunga (%)" />
                    </Field>
                  </>
                )}
              </div>
            </GalatForm>

            {pratinjau && <Pesan jenis="info">{teksPratinjau(pratinjau)}</Pesan>}
            {simpanan && !edit.asal && induk.length === 0 && <Pesan jenis="peringatan">Tambahkan dulu bank, e-wallet, atau tunai sebagai tempat simpanannya.</Pesan>}
            {galat && !galat.kolom && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}

            {edit.asal?.bawaan ? (
              <p className={s.redup} style={{ margin: "0 20px" }}>
                Kantong tunai bawaan nggak bisa dihapus, supaya transaksi tunai selalu punya tempat. Nama dan saldo
                awalnya boleh diubah.
              </p>
            ) : (
              edit.asal && (
                <button type="button" className={`${s.flat} ${s.flatBahaya}`} onClick={mintaHapus}>
                  {simpanan ? "Hapus simpanan" : "Hapus kantong"}
                </button>
              )
            )}

            <button type="submit" hidden />
          </form>

          {yakinHapus && edit.asal && infoEdit && aktifEdit ? (
            <LembarBunga
              judul={`Hapus deposito “${edit.asal.name}”?`}
              awal={0}
              keterangan={`Pencairan sebelum jatuh tempo biasanya tanpa bunga. ${fmtIDR(edit.asal.saldo)} kembali ke ${namaInduk(edit.asal.induk_id)}, lalu deposito ini dihapus beserta riwayatnya.`}
              ya="Hapus"
              loading={loading}
              galat={galat?.pesan ?? null}
              onBatal={() => setYakinHapus(false)}
              onYa={(b) => void hapus(b)}
            />
          ) : yakinHapus && edit.asal && (
            <Konfirmasi
              tanya={`Hapus ${simpanan ? "simpanan" : "kantong"} “${edit.asal.name}”?`}
              ya="Hapus"
              loading={loading}
              error={galat?.pesan}
              onBatal={() => setYakinHapus(false)}
              onYa={() => void hapus()}
            >
              {ketHapus(edit.asal)}
            </Konfirmasi>
          )}
        </Lembar>
      )}
    </>
  );
}
