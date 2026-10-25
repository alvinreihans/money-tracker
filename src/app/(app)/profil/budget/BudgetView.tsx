"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCatat, useKategori } from "@/components/Catat";
import { IKON } from "@/components/KartuMetode";
import { tandaKategori } from "@/components/kategori";
import { AppBar, BarisPilih, Field, GalatForm, InputNominal, Pesan, Spinner, useGalat } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, fmtIDRRingkas, isianNominal } from "@/lib/format";
import { kategoriJenis } from "@/lib/kategori";
import { cekPersen, KELOMPOK, LABEL_METODE, METODE, NAMA_KELOMPOK, wadahMetode, type Kelompok, type Metode, type PengaturanMetode } from "@/lib/metode";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { rapikanBudget } from "@/lib/transaksi-input";

const PERSEN_AWAL: Record<Kelompok, number> = { kebutuhan: 50, keinginan: 30, tabungan: 20, berbagi: 0 };

/** Penjelasan metode terpilih, di bawah pratinjau. */
const PENJELASAN: Record<Metode, string> = {
  kategori: "Batas rupiah untuk tiap kategori. Cocok kalau kamu sudah tahu pos mana yang sering bocor.",
  "50-30-20": "Seimbang: separuh pemasukan untuk kebutuhan, sisanya untuk keinginan dan tabungan. Cocok untuk mulai mengatur keuangan.",
  "80-20": "Paling sederhana: sisihkan 20% untuk tabungan dulu, 80% sisanya bebas dipakai. Cocok kalau tidak ingin repot mengelompokkan pengeluaran.",
  "70-20-10": "Seperti 80/20, ditambah 10% untuk berbagi: zakat, sedekah, donasi, atau hadiah.",
  kustom: "Atur sendiri persen tiap kelompok, mis. 60/20/10/10 kalau biaya hidupmu tinggi. Jumlahnya harus 100%.",
};

const ABU = "var(--titik)";

/**
 * Pratinjau pembagian pemasukan untuk metode terpilih, seperti pratinjau di
 * halaman pilihan resolusi One UI: satu bilah per persen, lalu satu kolom per
 * wadah (nama, persen, rupiah). Per kategori: total target dibanding pemasukan.
 */
function Pratinjau({
  metode,
  persen,
  basis,
  bulanBasis,
  totalKategori,
}: {
  metode: Metode;
  persen: Record<Kelompok, number>;
  basis: number;
  bulanBasis: string;
  totalKategori: number;
}) {
  type Potong = { warna: string; nama: string; persen: number; utama: string; sub: string | null; bahaya?: boolean };
  let potong: Potong[];
  if (metode === "kategori") {
    const pakai = basis > 0 ? Math.round((totalKategori / basis) * 100) : 0;
    potong = [
      { warna: IKON.kebutuhan.warna, nama: "Ditargetkan", persen: basis > 0 ? Math.min(pakai, 100) : totalKategori > 0 ? 100 : 0, utama: fmtIDRRingkas(totalKategori), sub: basis > 0 ? `${pakai}% pemasukan` : null },
    ];
    if (basis > 0 && totalKategori > basis)
      potong.push({ warna: "var(--bahaya)", nama: "Melebihi pemasukan", persen: 0, utama: fmtIDRRingkas(totalKategori - basis), sub: null, bahaya: true });
    else if (basis > 0) potong.push({ warna: ABU, nama: "Belum dibagi", persen: 0, utama: fmtIDRRingkas(basis - totalKategori), sub: `${100 - pakai}% pemasukan` });
  } else {
    potong = wadahMetode(metode, metode === "kustom" ? persen : null).map((w) => ({
      warna: (IKON[w.id] ?? IKON.kebutuhan).warna,
      nama: w.nama,
      persen: w.persen,
      utama: `${w.persen}%`,
      sub: basis > 0 ? fmtIDRRingkas(Math.round((basis * w.persen) / 100)) : null,
    }));
    const sisa = 100 - potong.reduce((t, p) => t + p.persen, 0);
    if (sisa > 0) potong.push({ warna: ABU, nama: "Belum dibagi", persen: 0, utama: `${sisa}%`, sub: null });
  }
  const terisi = potong.reduce((t, p) => t + p.persen, 0);

  return (
    <div className={`${s.blok} ${s.blokIsi} ${s.pratinjau}`}>
      <p className={s.redup} style={{ margin: 0 }}>
        {basis > 0 ? `Pemasukan ${bulanBasis} ${fmtIDR(basis)}` : "Belum ada pemasukan bulan ini. Rupiahnya muncul setelah ada pemasukan."}
      </p>
      {/* Bilah hanya gambaran; angkanya ada di kolom di bawahnya. */}
      <div className={s.pratinjauBilah} aria-hidden>
        {potong
          .filter((p) => p.persen > 0)
          .map((p, i) => (
            <span key={i} style={{ flexGrow: p.persen, background: p.warna }} />
          ))}
        <span key="sisa" style={{ flexGrow: Math.max(0, 100 - terisi), background: "transparent" }} />
      </div>
      <ul className={s.pratinjauKolom}>
        {potong.map((p) => (
          <li key={p.nama}>
            <span className={s.redup}>
              <i style={{ background: p.warna }} aria-hidden />
              {p.nama}
            </span>
            <strong style={p.bahaya ? { color: "var(--bahaya)" } : undefined}>{p.utama}</strong>
            {p.sub && <span className={s.redup}>{p.sub}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Budget: pilih metode (SPEC-metode-budget) — per kategori, atau membagi
 * pemasukan per kelompok (50/30/20, 80/20, 70/20/10, kustom). Per kategori:
 * satu form untuk semua kategori, isi nominal untuk memasang target,
 * kosongkan untuk melepasnya; rerata 3 bulan terakhir jadi patokan.
 * Targetnya tetap tersimpan selama metode lain dipakai.
 */
export default function BudgetView({
  userId,
  awal,
  rerata,
  pengaturan,
  basis,
  bulanBasis,
}: {
  userId: string;
  awal: Record<string, number>;
  rerata: Record<string, number>;
  pengaturan: PengaturanMetode;
  /** Pemasukan bulan ini (atau lalu): contoh rupiah tiap metode. */
  basis: number;
  /** Bulan asal `basis`, mis. "Oktober" (awal bulan tanpa pemasukan: bulan lalu). */
  bulanBasis: string;
}) {
  const router = useRouter();
  const { kabari } = useCatat();
  const [metode, setMetode] = useState<Metode>(pengaturan.metode);
  const [persen, setPersen] = useState<Record<Kelompok, string>>(
    () => Object.fromEntries(KELOMPOK.map((k) => [k, String(pengaturan.persen?.[k] ?? PERSEN_AWAL[k])])) as Record<Kelompok, string>,
  );
  const [menyimpanMetode, setMenyimpanMetode] = useState(false);
  const persenGalat = useGalat(persen);
  const angkaPersen = Object.fromEntries(KELOMPOK.map((k) => [k, Number(persen[k] || 0)])) as Record<Kelompok, number>;
  const totalPersen = KELOMPOK.reduce((t, k) => t + angkaPersen[k], 0);

  async function pakaiMetode(m: Metode, p: Record<Kelompok, number> | null = null) {
    setMenyimpanMetode(true);
    const { error } = await createSupabaseBrowserClient()
      .from("metode_budget")
      .upsert({ user_id: userId, metode: m, persen: p, updated_at: new Date().toISOString() });
    setMenyimpanMetode(false);
    if (error) return kabari(dbErrorMessage(error));
    setMetode(m);
    kabari(m === "kategori" ? "Memakai budget per kategori" : `Memakai metode ${LABEL_METODE[m].nama}`);
    router.refresh();
  }

  function pilih(m: Metode) {
    if (m === metode && m !== "kustom") return;
    // Kustom: atur persennya dulu, baru disimpan.
    if (m === "kustom") return setMetode("kustom");
    void pakaiMetode(m);
  }

  function simpanKustom(e?: FormEvent) {
    e?.preventDefault();
    const cek = cekPersen(angkaPersen);
    if (!cek.ok) return persenGalat.gagal(cek.error, "persen");
    void pakaiMetode("kustom", cek.persen);
  }

  const kategori = useKategori();
  const keluar = kategoriJenis(kategori, "expense");
  const [isian, setIsian] = useState<Record<string, string>>(() =>
    Object.fromEntries(keluar.map((k) => [k.slug, isianNominal(awal[k.slug])])),
  );
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "sukses" | "bahaya"; teks: string } | null>(null);
  const { galat, gagal, bersihkan } = useGalat(isian);
  const total = Object.values(isian).reduce((t, v) => t + (Number(v) > 0 ? Number(v) : 0), 0);

  async function simpan(e: FormEvent) {
    e.preventDefault();
    setPesan(null);
    bersihkan();
    const cek = rapikanBudget(isian, kategori);
    if (!cek.ok) return gagal(cek.error, cek.kolom);

    setLoading(true);
    const db = createSupabaseBrowserClient();
    const [pasang, lepas] = await Promise.all([
      cek.simpan.length
        ? db.from("budgets").upsert(cek.simpan.map((b) => ({ ...b, user_id: userId, updated_at: new Date().toISOString() })))
        : { error: null },
      cek.hapus.length ? db.from("budgets").delete().in("category", cek.hapus) : { error: null },
    ]);
    setLoading(false);

    const err = pasang.error ?? lepas.error;
    if (err) return setPesan({ jenis: "bahaya", teks: dbErrorMessage(err) });
    setPesan({ jenis: "sukses", teks: "Budget tersimpan." });
    router.refresh();
  }

  return (
    <>
      <AppBar
        judul="Budget"
        sub={metode !== "kategori" ? `Metode ${LABEL_METODE[metode].nama}` : total > 0 ? `${fmtIDR(total)} per bulan` : "Batas pengeluaran per bulan"}
        kembali="/profil"
      />

      <div className={s.isi}>
        <Pratinjau metode={metode} persen={angkaPersen} basis={basis} bulanBasis={bulanBasis} totalKategori={total} />
        <p className={s.redup} style={{ margin: "0 20px" }}>
          {PENJELASAN[metode]}
        </p>

        <h2 className={s.subheader}>Metode</h2>
        <div className={s.blok} role="radiogroup" aria-label="Metode budgeting" aria-busy={menyimpanMetode}>
          {METODE.map((m) => (
            <BarisPilih key={m} peran="radio" dipilih={metode === m} onClick={() => pilih(m)}>
              <span className={s.barisTeks}>
                <span className={s.barisJudul}>{LABEL_METODE[m].nama}</span>
                <span className={s.redup} style={{ whiteSpace: "normal" }}>
                  {LABEL_METODE[m].ket}
                </span>
              </span>
            </BarisPilih>
          ))}
        </div>

        {metode === "kustom" && (
          <form className={s.form} onSubmit={simpanKustom}>
            <GalatForm value={persenGalat.galat}>
              <div className={`${s.blok} ${s.blokForm}`} data-kolom="persen">
                {KELOMPOK.map((k) => (
                  <Field key={k} label={`${NAMA_KELOMPOK[k]} (%)`} kolom={k === "kebutuhan" ? "persen" : undefined}>
                    <input
                      inputMode="numeric"
                      value={persen[k]}
                      onChange={(e) => setPersen((v) => ({ ...v, [k]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                      placeholder={`${NAMA_KELOMPOK[k]} (%)`}
                    />
                  </Field>
                ))}
              </div>
            </GalatForm>
            <p className={totalPersen === 100 ? s.redup : s.galat} style={{ margin: "0 20px" }} role="status">
              Total {totalPersen}%{totalPersen === 100 ? " ✓" : " — harus 100%"}
            </p>
            <button type="submit" className={s.tombol} disabled={menyimpanMetode}>
              {menyimpanMetode ? <Spinner /> : "Pakai persen ini"}
            </button>
          </form>
        )}

        {metode !== "kategori" && (
          <p className={s.redup} style={{ margin: "0 20px" }}>
            Kelompok tiap kategori bisa diubah di Profil → Kategori, dan tiap transaksi di Edit transaksi. Target per kategori tetap tersimpan, dipakai lagi kalau kembali ke Per kategori.
          </p>
        )}
      </div>

      {metode === "kategori" && (
        <form className={`${s.isi} ${s.form}`} onSubmit={simpan} style={{ marginTop: 16 }}>
          <p className={s.redup} style={{ margin: "0 20px" }}>
            Berlaku sama tiap bulan. Kosongkan kalau kategori itu nggak perlu dibatasi.
          </p>

          <GalatForm value={galat}>
            <div className={`${s.blok} ${s.blokForm}`}>
              {keluar.map(({ slug: k, name: label, ...gaya }) => (
                <Field
                  key={k}
                  kolom={k}
                  label={label}
                  ikon={tandaKategori(gaya).ikon}
                  keterangan={rerata[k] ? `Rerata ${fmtIDR(rerata[k])}/bulan, 3 bulan terakhir` : undefined}
                >
                  <InputNominal value={isian[k] ?? ""} onChange={(n) => setIsian((v) => ({ ...v, [k]: n }))} placeholder={label} />
                </Field>
              ))}
            </div>
          </GalatForm>

          {galat && !galat.kolom && <Pesan jenis="bahaya">{galat.pesan}</Pesan>}
          {pesan && <Pesan jenis={pesan.jenis}>{pesan.teks}</Pesan>}

          <button type="submit" className={s.tombol} disabled={loading}>
            {loading ? <Spinner /> : "Simpan"}
          </button>
        </form>
      )}
    </>
  );
}
