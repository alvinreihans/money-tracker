"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarDays, Plus, Smile, Wallet } from "lucide-react";
import { AppBar, Field, InputNominal, Konfirmasi, Kosong, Lembar, Pesan, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, isianNominal, isoLokal } from "@/lib/format";
import { ambilEmoji, emojiKantong, SARAN_EMOJI_KANTONG, type Kantong } from "@/lib/kantong";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validasiKantong } from "@/lib/transaksi-input";
import { fmtJam, jamWIB, saldoSejakDari } from "@/lib/waktu";

interface Isian {
  name: string;
  emoji: string;
  saldo_awal: string;
  saldo_per: string;
}

/**
 * Daftar kantong (rekening, e-wallet, tunai) dan saldonya sekarang. Tiap
 * kantong punya saldo awal per tanggal tertentu; transaksi sejak tanggal itu
 * yang tertaut ke kantongnya menggeser saldonya.
 *
 * Bank atau e-wallet tidak perlu dibedakan — tidak ada hitungan yang
 * bergantung padanya — jadi penandanya cukup emoji pilihan user. Satu-satunya
 * kantong tunai adalah "Tunai" bawaan, yang tidak bisa dihapus.
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

export default function KantongView({ userId, daftar }: { userId: string; daftar: (Kantong & { saldo: number })[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; bawaan: boolean; isian: Isian } | null>(null);
  const [yakinHapus, setYakinHapus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = daftar.reduce((t, k) => t + k.saldo, 0);

  function buka(k?: Kantong) {
    setError(null);
    setYakinHapus(false);
    setEdit({
      id: k?.id ?? null,
      bawaan: Boolean(k?.bawaan),
      isian: k
        ? { name: k.name, emoji: emojiKantong(k), saldo_awal: isianNominal(k.saldo_awal), saldo_per: k.saldo_per }
        : { name: "", emoji: SARAN_EMOJI_KANTONG[0], saldo_awal: "", saldo_per: isoLokal(new Date()) },
    });
  }

  function tutup() {
    if (!loading) setEdit(null);
  }

  const ubah = (p: Partial<Isian>) => setEdit((v) => (v ? { ...v, isian: { ...v.isian, ...p } } : v));

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    if (!edit) return;
    setError(null);
    const cek = validasiKantong({ ...edit.isian });
    if (!cek.ok) return setError(cek.error);

    // Saldo berlaku sejak (SPEC-saldo-waktu): diisi hari ini → jam sekarang;
    // tanggal lain → awal hari itu. Tidak diubah kalau tanggal & nominalnya tetap.
    const asal = edit.id ? daftar.find((k) => k.id === edit.id) : undefined;
    const hariIni = isoLokal(new Date());
    const baruSaldo =
      !asal ||
      asal.saldo_per !== cek.data.saldo_per ||
      (cek.data.saldo_per === hariIni && Number(asal.saldo_awal) !== cek.data.saldo_awal);
    const data = baruSaldo ? { ...cek.data, saldo_sejak: saldoSejakDari(cek.data.saldo_per) } : cek.data;

    setLoading(true);
    const tabel = createSupabaseBrowserClient().from("user_accounts");
    const { error: err } = edit.id
      ? await tabel.update(data).eq("id", edit.id)
      : await tabel.insert({ ...data, user_id: userId });
    setLoading(false);

    if (err) return setError(dbErrorMessage(err, `Kantong "${cek.data.name}"`));
    setEdit(null);
    router.refresh();
  }

  async function hapus() {
    if (!edit?.id) return;
    setLoading(true);
    const { error: err } = await createSupabaseBrowserClient().from("user_accounts").delete().eq("id", edit.id);
    setLoading(false);

    if (err) return setError(dbErrorMessage(err));
    setEdit(null);
    router.refresh();
  }

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
        {daftar.length > 0 ? (
          <>
            <div className={s.blok}>
              {daftar.map((k) => (
                <button key={k.id} type="button" className={`${s.baris} ${s.tekan}`} onClick={() => buka(k)}>
                  <span className={s.barisEmoji} aria-hidden>
                    {emojiKantong(k)}
                  </span>
                  <span className={s.barisTeks}>
                    <span className={s.barisJudul}>{k.name}</span>
                  </span>
                  <span className={`${s.nominal} ${k.saldo < 0 ? s.bahaya : ""}`}>{fmtIDR(k.saldo)}</span>
                </button>
              ))}
            </div>
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

      {edit && (
        <Lembar
          judul={edit.id ? "Ubah kantong" : "Tambah kantong"}
          posisi="penuh"
          onClose={tutup}
          pil={[
            { label: "Batal", onClick: tutup, disabled: loading },
            { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
          ]}
        >
          <form onSubmit={simpan} className={s.form}>
            <div className={s.kategoriPratinjau} aria-hidden>
              <span className={`${s.barisEmoji} ${s.emojiBesar}`}>{edit.isian.emoji}</span>
              <strong>{edit.isian.name.trim() || "Nama kantong"}</strong>
            </div>

            <div className={`${s.blok} ${s.blokForm}`}>
              <Field label="Nama" ikon={Wallet}>
                <input
                  required
                  maxLength={40}
                  value={edit.isian.name}
                  onChange={(e) => ubah({ name: e.target.value })}
                  placeholder="Nama"
                />
              </Field>
              <Field label="Emoji" ikon={Smile} keterangan="Pilih di bawah, atau ketik emoji lain dari keyboard.">
                <input
                  value={edit.isian.emoji}
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
                  <button
                    key={emoji}
                    type="button"
                    role="radio"
                    aria-checked={edit.isian.emoji === emoji}
                    aria-label={emoji}
                    onClick={() => ubah({ emoji })}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <Field label="Saldo awal (Rp)" ikon={Banknote}>
                <InputNominal
                  bolehMinus
                  value={edit.isian.saldo_awal}
                  onChange={(saldo_awal) => ubah({ saldo_awal })}
                  placeholder="Saldo awal (Rp)"
                />
              </Field>
              <Field
                label="Saldo per tanggal"
                ikon={CalendarDays}
                keterangan={keteranganSaldo(edit.isian.saldo_per, edit.id ? daftar.find((k) => k.id === edit.id) : undefined)}
              >
                <input type="date" required value={edit.isian.saldo_per} onChange={(e) => ubah({ saldo_per: e.target.value })} />
              </Field>
            </div>

            {error && <Pesan jenis="bahaya">{error}</Pesan>}

            {edit.bawaan ? (
              <p className={s.redup} style={{ margin: "0 20px" }}>
                Kantong tunai bawaan nggak bisa dihapus, supaya transaksi tunai selalu punya tempat. Nama dan saldo
                awalnya boleh diubah.
              </p>
            ) : (
              edit.id && (
                <button type="button" className={`${s.flat} ${s.flatBahaya}`} onClick={() => setYakinHapus(true)}>
                  Hapus kantong
                </button>
              )
            )}

            <button type="submit" hidden />
          </form>

          {yakinHapus && (
            <Konfirmasi
              tanya={`Hapus kantong “${edit.isian.name}”?`}
              ya="Hapus"
              loading={loading}
              error={error}
              onBatal={() => setYakinHapus(false)}
              onYa={() => void hapus()}
            >
              Transaksinya tetap ada, cuma lepas dari kantong ini dan nggak ikut saldo.
            </Konfirmasi>
          )}
        </Lembar>
      )}
    </>
  );
}
