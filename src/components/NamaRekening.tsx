"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { IdCard, Trash2 } from "lucide-react";
import { Field, Lembar, Spinner, useGalat } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { gabungNama, MAKS_NAMA, namaSama } from "@/lib/arah";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Profil → "Nama di rekening" (SPEC-catat-tuntas): nama user di rekening/
 * dompetnya, untuk memutuskan arah bukti transfer — penerima = user → masuk,
 * pengirim = user → keluar. Biasanya tersimpan sendiri saat user menjawab
 * "kirim atau terima?"; di sini bisa dilihat, dihapus, dan ditambah.
 */
export default function NamaRekening() {
  const db = useMemo(() => createSupabaseBrowserClient(), []);
  const [buka, setBuka] = useState(false);
  const [nama, setNama] = useState<string[] | null>(null);
  const [baru, setBaru] = useState("");
  const [loading, setLoading] = useState(false);
  const { galat, gagal, bersihkan } = useGalat({ baru });

  useEffect(() => {
    if (!buka) return;
    void db.auth.getUser().then(({ data }) => {
      const n = data.user?.user_metadata?.nama_rekening;
      setNama(Array.isArray(n) ? n.filter((x): x is string => typeof x === "string") : []);
    });
  }, [buka, db]);

  async function simpan(daftar: string[]) {
    setLoading(true);
    // user_metadata digabung, bukan diganti: tanda onboarding dll. tetap.
    const { error } = await db.auth.updateUser({ data: { nama_rekening: daftar } });
    setLoading(false);
    if (error) return gagal("Gagal menyimpan. Coba lagi ya.");
    setNama(daftar);
    return true;
  }

  async function tambah(e?: FormEvent) {
    e?.preventDefault();
    const n = baru.trim().replace(/\s+/g, " ");
    if (!n) return gagal("Namanya diisi dulu.", "baru");
    if (n.length > 60) return gagal("Kepanjangan, maksimal 60 huruf.", "baru");
    if (nama?.some((x) => namaSama(x, n))) return gagal("Nama ini sudah ada.", "baru");
    bersihkan();
    if (await simpan(gabungNama(nama ?? [], [n]))) setBaru("");
  }

  return (
    <>
      <button type="button" className={`${s.baris} ${s.tekan}`} onClick={() => setBuka(true)}>
        <span className={s.barisIkon} style={{ background: "color-mix(in srgb, #5ecb7a 18%, transparent)", color: "#5ecb7a" }} aria-hidden>
          <IdCard size={20} />
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul}>Nama di rekening</span>
          <span className={s.redup}>Untuk mengenali bukti transfer</span>
        </span>
      </button>

      {buka && (
        <Lembar
          judul="Nama di rekening"
          sub="Bukti transfer dengan nama ini dianggap milikmu: masuk kalau kamu penerimanya, keluar kalau pengirimnya."
          posisi="penuh"
          onClose={() => !loading && setBuka(false)}
        >
          {nama === null ? (
            <Spinner label="Memuat…" />
          ) : (
            <div className={s.form}>
              <div className={s.blok}>
                {nama.length === 0 ? (
                  <p className={s.redup} style={{ margin: 0, padding: "16px 20px" }}>
                    Belum ada. Nanti tersimpan sendiri saat kamu menjawab &ldquo;kirim atau terima?&rdquo; di Catat.
                  </p>
                ) : (
                  nama.map((n) => (
                    <div key={n} className={s.baris}>
                      <span className={s.barisTeks}>
                        <span className={s.barisJudul}>{n}</span>
                      </span>
                      <button
                        type="button"
                        className={s.ikonTombol}
                        aria-label={`Hapus ${n}`}
                        disabled={loading}
                        onClick={() => void simpan(nama.filter((x) => x !== n))}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {nama.length < MAKS_NAMA && (
                <form onSubmit={tambah} className={s.form}>
                  <div className={`${s.blok} ${s.blokForm}`}>
                    <Field label="Tambah nama" ikon={IdCard} kolom="baru" galat={galat?.kolom === "baru" ? galat.pesan : null} keterangan="Seperti tertulis di rekening, mis. “Rina Kartika”.">
                      <input value={baru} maxLength={60} onChange={(e) => setBaru(e.target.value)} placeholder="Tambah nama" autoComplete="name" />
                    </Field>
                  </div>
                  {galat && !galat.kolom && <p className={s.galat} role="alert">{galat.pesan}</p>}
                  <button type="submit" className={s.tombol} disabled={loading}>
                    {loading ? <Spinner /> : "Tambah"}
                  </button>
                </form>
              )}
            </div>
          )}
        </Lembar>
      )}
    </>
  );
}
