"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarDays, Plus, Wallet } from "lucide-react";
import { TANDA_KANTONG } from "@/components/kategori";
import { AppBar, Field, Kosong, Lembar, Pesan, Segmen, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, isoLokal } from "@/lib/format";
import { JENIS_KANTONG, type JenisKantong, type Kantong } from "@/lib/kantong";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validasiKantong } from "@/lib/transaksi-input";

interface Isian {
  name: string;
  kind: JenisKantong;
  saldo_awal: string;
  saldo_per: string;
}

const labelJenis = (k: JenisKantong) => JENIS_KANTONG.find((j) => j.id === k)?.label ?? k;

/**
 * Daftar kantong (rekening, e-wallet, tunai) dan saldonya sekarang. Tiap
 * kantong punya saldo awal per tanggal tertentu; transaksi sejak tanggal itu
 * yang tertaut ke kantongnya menggeser saldonya.
 */
export default function KantongView({ userId, daftar }: { userId: string; daftar: (Kantong & { saldo: number })[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; isian: Isian } | null>(null);
  const [yakinHapus, setYakinHapus] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = daftar.reduce((t, k) => t + k.saldo, 0);

  function buka(k?: Kantong) {
    setError(null);
    setYakinHapus(false);
    setEdit({
      id: k?.id ?? null,
      isian: k
        ? { name: k.name, kind: k.kind, saldo_awal: String(Number(k.saldo_awal)), saldo_per: k.saldo_per }
        : { name: "", kind: "bank", saldo_awal: "", saldo_per: isoLokal(new Date()) },
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

    setLoading(true);
    const tabel = createSupabaseBrowserClient().from("user_accounts");
    const { error: err } = edit.id
      ? await tabel.update(cek.data).eq("id", edit.id)
      : await tabel.insert({ ...cek.data, user_id: userId });
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
        kembali="/pengaturan"
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
              {daftar.map((k) => {
                const { ikon: Ikon, warna } = TANDA_KANTONG[k.kind] ?? TANDA_KANTONG.bank;
                return (
                  <button key={k.id} type="button" className={`${s.baris} ${s.tekan}`} onClick={() => buka(k)}>
                    <span
                      className={s.barisIkon}
                      style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }}
                      aria-hidden
                    >
                      <Ikon size={20} />
                    </span>
                    <span className={s.barisTeks}>
                      <span className={s.barisJudul}>{k.name}</span>
                      <span className={s.redup}>{labelJenis(k.kind)}</span>
                    </span>
                    <span className={`${s.nominal} ${k.saldo < 0 ? s.bahaya : ""}`}>{fmtIDR(k.saldo)}</span>
                  </button>
                );
              })}
            </div>
            <p className={s.redup} style={{ margin: "0 20px" }}>
              Saldo = saldo awal + transaksi di kantong itu sejak tanggal saldonya. Transaksi tanpa kantong nggak ikut
              dihitung.
            </p>
          </>
        ) : (
          <div className={s.blok}>
            <Kosong ikon={Wallet} judul="Belum ada kantong">
              Tambahkan rekening, e-wallet, atau dompet tunai, lengkap dengan saldonya sekarang.
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
            <Segmen label="Jenis kantong" pilihan={JENIS_KANTONG} nilai={edit.isian.kind} onChange={(kind) => ubah({ kind })} />

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
              <Field label="Saldo awal (Rp)" ikon={Banknote}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={edit.isian.saldo_awal}
                  onChange={(e) => ubah({ saldo_awal: e.target.value })}
                  placeholder="Saldo awal (Rp)"
                />
              </Field>
              <Field
                label="Saldo per tanggal"
                ikon={CalendarDays}
                keterangan="Saldo di awal tanggal ini. Transaksi mulai tanggal ini ikut menggeser saldonya."
              >
                <input type="date" required value={edit.isian.saldo_per} onChange={(e) => ubah({ saldo_per: e.target.value })} />
              </Field>
            </div>

            {error && <Pesan jenis="bahaya">{error}</Pesan>}

            {edit.id &&
              (yakinHapus ? (
                <Pesan
                  jenis="peringatan"
                  judul="Hapus kantong ini?"
                  aksi={
                    <button type="button" className={`${s.flat} ${s.flatBahaya}`} disabled={loading} onClick={() => void hapus()}>
                      Ya, hapus
                    </button>
                  }
                >
                  Transaksinya tetap ada, cuma lepas dari kantong ini dan nggak ikut saldo.
                </Pesan>
              ) : (
                <button type="button" className={`${s.flat} ${s.flatBahaya}`} onClick={() => setYakinHapus(true)}>
                  Hapus kantong
                </button>
              ))}

            <button type="submit" hidden />
          </form>
        </Lembar>
      )}
    </>
  );
}
