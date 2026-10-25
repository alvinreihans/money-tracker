"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Tag } from "lucide-react";
import { useKategori } from "@/components/Catat";
import { IKON_KATEGORI, NAMA_IKON, tandaKategori } from "@/components/kategori";
import { AppBar, Field, Konfirmasi, Lembar, Pesan, Spinner, useGalat } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import {
  kategoriJenis,
  KUNCI_IKON,
  LAINNYA,
  NAMA_WARNA,
  slugBaru,
  validasiKategori,
  WARNA_KATEGORI,
  type JenisKategori,
  type Kategori,
} from "@/lib/kategori";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const JUDUL: Record<JenisKategori, string> = { expense: "Pengeluaran", income: "Pemasukan" };

interface Isian {
  id: string | null;
  type: JenisKategori;
  slug: string;
  name: string;
  icon: string;
  color: string;
}

/**
 * Kategori milik user, per jenis. Bawaan boleh diubah dan dihapus kecuali
 * "Lainnya", yang jadi tempat jatuh: transaksi dari kategori yang dihapus
 * pindah ke sana, dan AI memakainya kalau tidak ada yang cocok.
 */
export default function KategoriView() {
  const router = useRouter();
  const kategori = useKategori();
  const [edit, setEdit] = useState<Isian | null>(null);
  // Jumlah transaksi yang akan pindah; null = belum minta konfirmasi hapus.
  const [akanPindah, setAkanPindah] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { galat, gagal, bersihkan } = useGalat(edit);

  function buka(type: JenisKategori, k?: Kategori) {
    bersihkan();
    setAkanPindah(null);
    setEdit(
      k
        ? { id: k.id ?? null, type, slug: k.slug, name: k.name, icon: k.icon, color: k.color }
        : { id: null, type, slug: "", name: "", icon: KUNCI_IKON[0], color: type === "income" ? "#5ecb7a" : WARNA_KATEGORI[0] },
    );
  }

  function tutup() {
    if (!loading) setEdit(null);
  }

  const ubah = (p: Partial<Isian>) => setEdit((v) => (v ? { ...v, ...p } : v));

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    if (!edit) return;
    bersihkan();
    const lain = kategoriJenis(kategori, edit.type).filter((k) => k.slug !== edit.slug);
    const cek = validasiKategori({ ...edit }, lain);
    if (!cek.ok) return gagal(cek.error, cek.kolom);

    setLoading(true);
    const tabel = createSupabaseBrowserClient().from("categories");
    const urutan = Math.max(0, ...lain.filter((k) => k.slug !== LAINNYA).map((k) => k.sort)) + 1;
    const { error: err } = edit.id
      ? await tabel.update(cek.data).eq("id", edit.id)
      : await tabel.insert({ ...cek.data, type: edit.type, slug: slugBaru(), sort: urutan });
    setLoading(false);

    if (err) return gagal(dbErrorMessage(err, `Kategori "${cek.data.name}"`));
    setEdit(null);
    router.refresh();
  }

  // Langkah 1: hitung dulu berapa transaksi yang akan pindah ke Lainnya.
  async function mintaHapus() {
    if (!edit) return;
    bersihkan();
    setLoading(true);
    const { count, error: err } = await createSupabaseBrowserClient()
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("type", edit.type)
      .eq("category", edit.slug);
    setLoading(false);
    if (err) return gagal("Gagal cek transaksi di kategori ini. Coba lagi.");
    setAkanPindah(count ?? 0);
  }

  // Langkah 2: pindahkan transaksinya, hapus budget-nya, lalu kategorinya — satu RPC.
  async function hapus() {
    if (!edit?.id) return;
    setLoading(true);
    const { error: err } = await createSupabaseBrowserClient().rpc("hapus_kategori", { p_id: edit.id });
    setLoading(false);
    if (err) return gagal(dbErrorMessage(err));
    setEdit(null);
    router.refresh();
  }

  const pratinjau = edit ? tandaKategori(edit) : null;

  return (
    <>
      <AppBar judul="Kategori" sub={`${kategori.length} kategori`} kembali="/profil" />

      <div className={s.isi}>
        {(["expense", "income"] as const).map((type) => (
          <section key={type} style={{ display: "contents" }}>
            <h2 className={s.subheader}>{JUDUL[type]}</h2>
            <div className={s.blok}>
              {kategoriJenis(kategori, type).map((k) => {
                const { ikon: Ikon, warna } = tandaKategori(k);
                return (
                  <button key={k.slug} type="button" className={`${s.baris} ${s.tekan}`} onClick={() => buka(type, k)}>
                    <span
                      className={s.barisIkon}
                      style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }}
                      aria-hidden
                    >
                      <Ikon size={20} />
                    </span>
                    <span className={s.barisTeks}>
                      <span className={s.barisJudul}>{k.name}</span>
                    </span>
                  </button>
                );
              })}
              <button type="button" className={s.blokKaki} onClick={() => buka(type)}>
                <Plus size={16} aria-hidden style={{ verticalAlign: -3, marginRight: 6 }} />
                Tambah kategori {JUDUL[type].toLowerCase()}
              </button>
            </div>
          </section>
        ))}
        <p className={s.redup} style={{ margin: "0 20px" }}>
          Daftar ini juga dipakai AI untuk memilih kategori saat kamu mengetik atau memfoto struk.
        </p>
      </div>

      {edit && pratinjau && (
        <Lembar
          judul={edit.id ? "Ubah kategori" : `Kategori ${JUDUL[edit.type].toLowerCase()} baru`}
          posisi="penuh"
          isian={edit}
          onClose={tutup}
          pil={[
            { label: "Batal", batal: true, disabled: loading },
            { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
          ]}
        >
          <form onSubmit={simpan} className={s.form}>
            <div className={s.kategoriPratinjau} aria-hidden>
              <span className={s.ikonBesar} style={{ background: `color-mix(in srgb, ${pratinjau.warna} 18%, transparent)`, color: pratinjau.warna }}>
                <pratinjau.ikon size={30} />
              </span>
              <strong>{edit.name.trim() || "Nama kategori"}</strong>
            </div>

            <div className={`${s.blok} ${s.blokForm}`}>
              <Field label="Nama" ikon={Tag} galat={galat?.kolom === "name" ? galat.pesan : null} kolom="name">
                <input required maxLength={30} value={edit.name} onChange={(e) => ubah({ name: e.target.value })} placeholder="Nama" />
              </Field>
            </div>

            <h3 className={s.subheader}>Ikon</h3>
            <div className={`${s.blok} ${s.blokIsi}`}>
              <div className={s.gridIkon} role="radiogroup" aria-label="Ikon">
                {KUNCI_IKON.map((kunci) => {
                  const Ikon = IKON_KATEGORI[kunci];
                  const dipilih = edit.icon === kunci;
                  return (
                    <button
                      key={kunci}
                      type="button"
                      role="radio"
                      aria-checked={dipilih}
                      aria-label={NAMA_IKON[kunci]}
                      onClick={() => ubah({ icon: kunci })}
                      style={dipilih ? { background: `color-mix(in srgb, ${edit.color} 22%, transparent)`, color: edit.color, boxShadow: `inset 0 0 0 2px ${edit.color}` } : undefined}
                    >
                      <Ikon size={22} />
                    </button>
                  );
                })}
              </div>
            </div>

            <h3 className={s.subheader}>Warna</h3>
            <div className={`${s.blok} ${s.blokIsi}`}>
              <div className={s.gridWarna} role="radiogroup" aria-label="Warna">
                {[...WARNA_KATEGORI, ...(edit.slug === LAINNYA ? ["#9b9b9b"] : [])].map((w) => (
                  <button
                    key={w}
                    type="button"
                    role="radio"
                    aria-checked={edit.color === w}
                    aria-label={NAMA_WARNA[w] ?? w}
                    onClick={() => ubah({ color: w })}
                    style={{ background: w }}
                  >
                    {edit.color === w && <Check size={18} color="#000" aria-hidden />}
                  </button>
                ))}
              </div>
            </div>

            {galat && galat.kolom !== "name" && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}

            {edit.id &&
              (edit.slug === LAINNYA ? (
                <p className={s.redup} style={{ margin: "0 20px" }}>
                  &ldquo;Lainnya&rdquo; nggak bisa dihapus: transaksi dari kategori yang dihapus pindah ke sini.
                </p>
              ) : (
                <button type="button" className={`${s.flat} ${s.flatBahaya}`} disabled={loading} onClick={() => void mintaHapus()}>
                  Hapus kategori
                </button>
              ))}

            <button type="submit" hidden />
          </form>

          {akanPindah !== null && (
            <Konfirmasi
              tanya={`Hapus kategori “${edit.name}”?`}
              ya="Hapus"
              loading={loading}
              error={galat?.pesan}
              onBatal={() => setAkanPindah(null)}
              onYa={() => void hapus()}
            >
              {akanPindah > 0 ? `${akanPindah} transaksi akan dipindah ke Lainnya.` : "Belum ada transaksi di kategori ini."}
              {edit.type === "expense" ? " Budget-nya ikut dihapus." : ""}
            </Konfirmasi>
          )}
        </Lembar>
      )}
    </>
  );
}
