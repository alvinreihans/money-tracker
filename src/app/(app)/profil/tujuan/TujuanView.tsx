"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CircleAlert, CircleCheck, History, Landmark, Pencil, PiggyBank, Plus, ShoppingBag, Smile, Target, Wallet } from "lucide-react";
import { useCatat } from "@/components/Catat";
import { AppBar, Field, GalatForm, InputNominal, Konfirmasi, Kosong, Lembar, Pesan, Pilih, Spinner, useGalat } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, fmtIDRRingkas, isianNominal, isoLokal } from "@/lib/format";
import { ambilEmoji, emojiKantong, pesanGagalKantong, type Kantong } from "@/lib/kantong";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validasiTujuan } from "@/lib/transaksi-input";
import { dampakHapusTujuan, EMOJI_TUJUAN, progresTujuan } from "@/lib/tujuan";
import { saldoSejakDari } from "@/lib/waktu";

/** `transaksi`: jumlah transaksi yang menyentuh tujuan ini (untuk konfirmasi hapus). */
type Tujuan = Kantong & { saldo: number; dipakai: number; transaksi: number };

interface Isian {
  name: string;
  emoji: string;
  target: string;
  tenggat: string;
  saldo_awal: string;
  /** Kantong tempat uangnya disimpan; kosong = terpisah (SPEC-simpanan). */
  induk_id: string;
}

const SARAN_EMOJI = [EMOJI_TUJUAN, "📱", "💻", "🏠", "🚗", "🏍️", "✈️", "🎓", "💍", "🛟"];

const bulanTahun = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Keterangan progres, ditulis (bukan warna saja). */
function teksProgres(t: Tujuan, hariIni: string): { teks: string; ikon?: "capai" | "telat" } {
  const p = progresTujuan(t, hariIni);
  if (p.tercapai) return { teks: "Tercapai", ikon: "capai" };
  if (p.telat) return { teks: `Lewat tenggat, kurang ${fmtIDRRingkas(p.sisa)}`, ikon: "telat" };
  if (p.perBulan != null && t.tenggat) return { teks: `Sisihkan ${fmtIDRRingkas(p.perBulan)}/bulan sampai ${bulanTahun(t.tenggat)}` };
  return { teks: `Kurang ${fmtIDRRingkas(p.sisa)}` };
}

/**
 * Tujuan tabungan (SPEC-tujuan-tabungan): kantong berjenis "tujuan" dengan
 * target & tenggat. Menyisihkan = pindah kantong ke tujuan; memakai =
 * pengeluaran dari tujuan, yang tidak dihitung di jatah bulanan metode.
 * Tujuan yang sudah dipakai habis pindah ke "Selesai". Tujuan bisa dihapus
 * kapan saja; konfirmasinya menyebut saldo yang keluar dari Total aset dan
 * transaksi yang kehilangan tujuannya (SPEC-perbaikan-temuan C5).
 *
 * "Disimpan di" (SPEC-simpanan): uang tujuan yang tetap ada di rekening lain
 * ikut tampil di saldo gabungan rekening itu. Mengubahnya tidak memindahkan uang.
 */
export default function TujuanView({
  userId,
  daftar,
  tempat,
}: {
  userId: string;
  daftar: Tujuan[];
  /** Pilihan "Disimpan di": bank, e-wallet, tunai. */
  tempat: { id: string; name: string; emoji: string | null; kind: string }[];
}) {
  const router = useRouter();
  const { bukaManual } = useCatat();
  const hariIni = isoLokal(new Date());
  const [aksi, setAksi] = useState<Tujuan | null>(null);
  const [edit, setEdit] = useState<{ asal: Tujuan | null; isian: Isian } | null>(null);
  const [yakinHapus, setYakinHapus] = useState(false);
  const [loading, setLoading] = useState(false);
  const { galat, gagal, bersihkan } = useGalat(edit?.isian);

  const selesai = daftar.filter((k) => k.saldo <= 0 && k.dipakai > 0);
  const aktif = daftar.filter((k) => !selesai.includes(k));
  const terkumpul = aktif.reduce((n, k) => n + Math.max(0, k.saldo), 0);

  function buka(k?: Tujuan) {
    bersihkan();
    setYakinHapus(false);
    setAksi(null);
    setEdit({
      asal: k ?? null,
      isian: k
        ? { name: k.name, emoji: k.emoji || EMOJI_TUJUAN, target: isianNominal(k.target), tenggat: k.tenggat ?? "", saldo_awal: isianNominal(k.saldo_awal), induk_id: k.induk_id ?? "" }
        : { name: "", emoji: EMOJI_TUJUAN, target: "", tenggat: "", saldo_awal: "", induk_id: "" },
    });
  }

  const ubah = (p: Partial<Isian>) => setEdit((v) => (v ? { ...v, isian: { ...v.isian, ...p } } : v));

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    if (!edit) return;
    bersihkan();
    // Saldo awal = yang sudah terkumpul sebelum memakai aplikasi, berlaku sejak tujuan dibuat.
    // Tenggat paling cepat hari ini; tenggat lama yang sudah lewat boleh tetap (C7).
    const cek = validasiTujuan({ ...edit.isian, saldo_per: edit.asal?.saldo_per ?? hariIni, hari_ini: hariIni, tenggat_lama: edit.asal?.tenggat ?? null });
    if (!cek.ok) return gagal(cek.error, cek.kolom);
    const data = { ...cek.data, induk_id: edit.isian.induk_id || null };

    setLoading(true);
    const db = createSupabaseBrowserClient();
    const tabel = db.from("user_accounts");
    const { error: err } = edit.asal
      ? await tabel.update(data).eq("id", edit.asal.id)
      : await tabel.insert({ ...data, user_id: userId, kind: "tujuan", saldo_sejak: saldoSejakDari(cek.data.saldo_per) });
    const pesan = err ? await pesanGagalKantong(db, err, cek.data.name, edit.asal?.id ?? null, dbErrorMessage(err, `Tujuan "${cek.data.name}"`)) : null;
    setLoading(false);
    if (err) return gagal(pesan!, err.code === "23505" ? "name" : undefined);
    setEdit(null);
    router.refresh();
  }

  async function hapus() {
    if (!edit?.asal) return;
    setLoading(true);
    const { error: err } = await createSupabaseBrowserClient().from("user_accounts").delete().eq("id", edit.asal.id);
    setLoading(false);
    if (err) return gagal(dbErrorMessage(err));
    setEdit(null);
    router.refresh();
  }

  const namaTempat = (id: string | null | undefined) => (id ? tempat.find((t) => t.id === id)?.name : undefined);

  const baris = (k: Tujuan) => {
    const p = progresTujuan(k, hariIni);
    const ket = teksProgres(k, hariIni);
    const habis = selesai.includes(k);
    return (
      <button key={k.id} type="button" className={`${s.baris} ${s.tekan}`} style={{ alignItems: "flex-start" }} onClick={() => setAksi(k)}>
        <span className={s.barisEmoji} aria-hidden>
          {k.emoji || EMOJI_TUJUAN}
        </span>
        <span className={s.barisTeks}>
          <span className={s.budgetAtas}>
            <span className={s.barisJudul}>{k.name}</span>
            <span className={s.nominal}>{fmtIDR(habis ? k.dipakai : p.terkumpul)}</span>
          </span>
          {namaTempat(k.induk_id) && <span className={s.redup}>di {namaTempat(k.induk_id)}</span>}
          {habis ? (
            <span className={s.redup}>Sudah dipakai</span>
          ) : (
            <>
              <span
                className={s.progres}
                role="progressbar"
                aria-label={`${k.name}: ${p.persen}% dari target`}
                aria-valuenow={p.persen}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${p.persen}%`, background: p.tercapai ? "var(--sukses)" : p.telat ? "var(--peringatan)" : "var(--primer)" }} />
              </span>
              <span className={s.budgetBawah}>
                <span style={ket.ikon === "telat" ? { color: "var(--peringatan)", display: "inline-flex", alignItems: "center", gap: 4 } : undefined}>
                  {ket.ikon === "capai" && <CircleCheck size={14} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />}
                  {ket.ikon === "telat" && <CircleAlert size={14} aria-hidden />}
                  {ket.teks}
                </span>
                <span style={{ whiteSpace: "nowrap" }}>dari {fmtIDRRingkas(Number(k.target))}</span>
              </span>
            </>
          )}
        </span>
      </button>
    );
  };

  return (
    <>
      <AppBar
        judul="Tujuan tabungan"
        sub={aktif.length > 0 ? `${fmtIDR(terkumpul)} terkumpul` : "Sisihkan untuk rencana besar"}
        kembali="/profil"
        aksi={
          <button type="button" className={s.ikonTombol} aria-label="Tujuan baru" onClick={() => buka()}>
            <Plus size={24} />
          </button>
        }
      />

      <div className={s.isi}>
        {aktif.length > 0 ? (
          <div className={s.blok}>{aktif.map(baris)}</div>
        ) : (
          <div className={s.blok}>
            <Kosong ikon={Target} judul="Belum ada tujuan">
              Mis. HP baru, liburan, atau dana darurat. Sisihkan sedikit demi sedikit; saat dipakai, belanjanya tidak menghabiskan jatah bulan itu.
              <br />
              <button type="button" className={s.tombol} style={{ marginTop: 16 }} onClick={() => buka()}>
                Buat tujuan
              </button>
            </Kosong>
          </div>
        )}

        <p className={s.redup} style={{ margin: "0 20px" }}>
          Menyisihkan dicatat sebagai pindah kantong ke tujuan, jadi bisa juga lewat Catat: &ldquo;sisihkan 500rb dari BCA ke HP baru&rdquo;.
        </p>

        {selesai.length > 0 && (
          <>
            <h2 className={s.subheader}>Selesai</h2>
            <div className={s.blok}>{selesai.map(baris)}</div>
          </>
        )}
      </div>

      {aksi && (
        <Lembar judul={aksi.name} sub={`${fmtIDR(Math.max(0, aksi.saldo))} dari ${fmtIDR(Number(aksi.target))}`} daftar onClose={() => setAksi(null)}>
          {[
            { label: "Sisihkan", ikon: PiggyBank, jalankan: () => bukaManual({ type: "transfer", category: "other", kantong_tujuan_id: aksi.id, merchant: aksi.name }) },
            { label: "Pakai", ikon: ShoppingBag, jalankan: () => bukaManual({ type: "expense", kantong_id: aksi.id, payment_method: aksi.name }) },
            // Riwayat tersaring ke kantong tujuan ini (SPEC-riwayat-filter).
            { label: "Lihat riwayat", ikon: History, jalankan: () => router.push(`/riwayat?kantong=${aksi.id}`) },
            { label: "Ubah", ikon: Pencil, jalankan: () => buka(aksi) },
          ].map(({ label, ikon: Ikon, jalankan }) => (
            <button
              key={label}
              type="button"
              className={s.baris}
              onClick={() => {
                setAksi(null);
                jalankan();
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

      {edit && (
        <Lembar
          judul={edit.asal ? "Ubah tujuan" : "Tujuan baru"}
          posisi="penuh"
          isian={edit.isian}
          onClose={() => !loading && setEdit(null)}
          pil={[
            { label: "Batal", batal: true, disabled: loading },
            { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
          ]}
        >
          <form onSubmit={simpan} className={s.form}>
            <div className={s.kategoriPratinjau} aria-hidden>
              <span className={`${s.barisEmoji} ${s.emojiBesar}`}>{edit.isian.emoji}</span>
              <strong>{edit.isian.name.trim() || "Nama tujuan"}</strong>
            </div>

            <GalatForm value={galat}>
              <div className={`${s.blok} ${s.blokForm}`}>
                <Field label="Nama" ikon={Target} kolom="name">
                  <input required maxLength={40} value={edit.isian.name} onChange={(e) => ubah({ name: e.target.value })} placeholder="Nama" />
                </Field>
                <Field label="Emoji" ikon={Smile} keterangan="Pilih di bawah, atau ketik emoji lain dari keyboard." kolom="emoji">
                  <input
                    value={edit.isian.emoji}
                    onChange={(e) => {
                      const emoji = ambilEmoji(e.target.value);
                      if (emoji) ubah({ emoji });
                    }}
                    placeholder="Emoji"
                    aria-label="Emoji tujuan"
                  />
                </Field>
                <div className={s.gridEmoji} role="radiogroup" aria-label="Pilihan emoji">
                  {SARAN_EMOJI.map((emoji) => (
                    <button key={emoji} type="button" role="radio" aria-checked={edit.isian.emoji === emoji} aria-label={emoji} onClick={() => ubah({ emoji })}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <Field label="Target (Rp)" ikon={Wallet} kolom="target">
                  <InputNominal value={edit.isian.target} onChange={(target) => ubah({ target })} placeholder="Target (Rp)" />
                </Field>
                <Field label="Tenggat" ikon={CalendarDays} keterangan="Opsional. Aplikasi menghitung berapa yang perlu disisihkan tiap bulan." kolom="tenggat">
                  <input type="date" value={edit.isian.tenggat} min={edit.asal ? undefined : hariIni} onChange={(e) => ubah({ tenggat: e.target.value })} aria-label="Tenggat" />
                </Field>
                <Pilih
                  label="Disimpan di"
                  ikon={Landmark}
                  kolom="induk_id"
                  nilai={edit.isian.induk_id}
                  pilihan={[{ id: "", label: "Terpisah", emoji: EMOJI_TUJUAN }, ...tempat.map((t) => ({ id: t.id, label: t.name, emoji: emojiKantong(t) }))]}
                  onChange={(induk_id) => ubah({ induk_id })}
                />
                <p className={s.redup} style={{ margin: "4px 0 0 46px", fontSize: 14 }}>
                  {edit.isian.induk_id
                    ? `Uangnya tetap di ${namaTempat(edit.isian.induk_id)}; saldo ${namaTempat(edit.isian.induk_id)} tampil termasuk tujuan ini. Tidak ada uang yang dipindah.`
                    : "Tampil sendiri, terpisah dari kantong mana pun."}
                </p>
                <Field label="Sudah terkumpul (Rp)" ikon={PiggyBank} keterangan="Yang sudah disisihkan sebelum memakai aplikasi. Setoran berikutnya dicatat lewat Sisihkan." kolom="saldo_awal">
                  <InputNominal value={edit.isian.saldo_awal} onChange={(saldo_awal) => ubah({ saldo_awal })} placeholder="Sudah terkumpul (Rp)" />
                </Field>
              </div>
            </GalatForm>

            {galat && !galat.kolom && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}

            {edit.asal && (
              <button type="button" className={`${s.flat} ${s.flatBahaya}`} onClick={() => setYakinHapus(true)}>
                Hapus tujuan
              </button>
            )}

            <button type="submit" hidden />
          </form>

          {yakinHapus && edit.asal && (
            <Konfirmasi
              tanya={`Hapus tujuan “${edit.asal.name}”?`}
              ya="Hapus"
              loading={loading}
              error={galat?.pesan}
              onBatal={() => setYakinHapus(false)}
              onYa={() => void hapus()}
            >
              {dampakHapusTujuan(edit.asal.saldo, edit.asal.transaksi).join(" ") || null}
            </Konfirmasi>
          )}
        </Lembar>
      )}
    </>
  );
}
