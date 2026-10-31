"use client";

import { useState, type FormEvent } from "react";
import { Banknote, PiggyBank } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCatat, useKategori } from "@/components/Catat";
import { IKON } from "@/components/KartuMetode";
import { tandaKategori } from "@/components/kategori";
import { AppBar, BarisPilih, Field, GalatForm, InputNominal, Lembar, Pesan, Spinner, useGalat } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, fmtIDRRingkas, isianNominal } from "@/lib/format";
import { kategoriJenis } from "@/lib/kategori";
import { cekPersen, KELOMPOK_KUSTOM, LABEL_METODE, METODE, NAMA_KELOMPOK, wadahMetode, type KelompokKustom, type Metode, type PengaturanMetode, type SaranPenghasilan } from "@/lib/metode";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { rapikanBudget } from "@/lib/transaksi-input";

const PERSEN_AWAL: Record<KelompokKustom, number> = { kebutuhan: 50, keinginan: 30, tabungan: 20, berbagi: 0 };

/** Penjelasan metode terpilih, di bawah pratinjau. */
const PENJELASAN: Record<Metode, string> = {
  kategori: "Batas rupiah untuk tiap kategori. Cocok kalau kamu sudah tahu pos mana yang sering bocor.",
  "50-30-20": "Seimbang: separuh penghasilan untuk kebutuhan, sisanya untuk keinginan dan tabungan. Cocok untuk mulai mengatur keuangan.",
  "80-20": "Paling sederhana: sisihkan 20% untuk tabungan dulu, 80% sisanya bebas dipakai. Cocok kalau tidak ingin repot mengelompokkan pengeluaran.",
  "70-20-10": "Seperti 80/20, ditambah 10% untuk berbagi: zakat, sedekah, donasi, atau hadiah.",
  kustom: "Atur sendiri persen tiap kelompok, mis. 60/20/10/10 kalau biaya hidupmu tinggi. Jumlahnya harus 100%.",
  // SPEC-metode-lanjutan: tabungannya dihitung dari yang benar-benar disisihkan, bukan sisa.
  "zero-based": "Setiap rupiah diberi tugas: target per kategori ditambah tabungan sampai sama dengan penghasilan. Tabungan dihitung dari yang benar-benar disisihkan ke tujuan.",
  pyf: "Sisihkan tabungan dulu begitu gajian, sisanya bebas dipakai tanpa batas per pos. Tabungan dihitung dari yang benar-benar disisihkan ke tujuan, bukan sisa.",
  "6-jars": "Enam toples: kebutuhan 55%, hiburan, pendidikan, tabungan jangka panjang, kebebasan finansial (investasi) masing-masing 10%, dan berbagi 5%.",
  kakeibo: "Metode Jepang: catat belanja di empat pos (bertahan hidup, pilihan, budaya, ekstra), pasang target tabungan, lalu refleksi di akhir bulan.",
};

/** Metode yang diisi dulu baru disimpan; selain ini tersimpan begitu diketuk. */
const ISI_DULU: Metode[] = ["kustom", "pyf", "kakeibo", "zero-based"];

const ABU = "var(--titik)";

/** Asal saran penghasilan, untuk keterangan di bawah nominalnya. */
const ketSaran = (s: SaranPenghasilan) =>
  s.sumber === "rerata" ? `Rerata ${s.bulan} bulan terakhir` : s.sumber === "bulan-ini" ? "Penghasilan bulan ini" : "Belum ada penghasilan tercatat";

/**
 * Pratinjau pembagian penghasilan untuk metode terpilih, seperti pratinjau di
 * halaman pilihan resolusi One UI: satu bilah per persen, lalu satu kolom per
 * wadah (nama, persen, rupiah). Per kategori: total target dibanding penghasilan.
 */
function Pratinjau({
  metode,
  persen,
  basis,
  ketBasis,
  onUbah,
  totalKategori,
  targetTabungan,
}: {
  metode: Metode;
  /** Persen Kustom, atau { tabungan } untuk Pay Yourself First. */
  persen: Partial<Record<KelompokKustom, number>>;
  /** Penghasilan per bulan yang dibagi (SPEC-tujuan-tabungan). */
  basis: number;
  ketBasis: string;
  onUbah: () => void;
  totalKategori: number;
  /** Target tabungan rupiah (Zero-Based, Kakeibo). */
  targetTabungan: number;
}) {
  type Potong = { warna: string; nama: string; persen: number; utama: string; sub: string | null; bahaya?: boolean };
  let potong: Potong[];
  const porsi = (n: number) => (basis > 0 ? Math.round((n / basis) * 100) : 0);
  if (metode === "kategori" || metode === "zero-based") {
    // Zero-Based: target kategori + tabungan harus pas dengan penghasilan.
    const zb = metode === "zero-based";
    const tab = zb ? targetTabungan : 0;
    const sisa = basis - totalKategori - tab;
    potong = [
      { warna: IKON.kebutuhan.warna, nama: "Ditargetkan", persen: basis > 0 ? Math.min(porsi(totalKategori), 100) : totalKategori > 0 ? 100 : 0, utama: fmtIDRRingkas(totalKategori), sub: basis > 0 ? `${porsi(totalKategori)}% penghasilan` : null },
    ];
    if (zb) potong.push({ warna: IKON.tabungan.warna, nama: "Tabungan", persen: Math.min(porsi(tab), 100), utama: fmtIDRRingkas(tab), sub: basis > 0 ? `${porsi(tab)}% penghasilan` : null });
    if (basis > 0 && sisa < 0)
      potong.push({ warna: "var(--bahaya)", nama: "Melebihi penghasilan", persen: 0, utama: fmtIDRRingkas(-sisa), sub: null, bahaya: true });
    else if (zb && basis > 0)
      potong.push({ warna: sisa > 0 ? "var(--peringatan)" : ABU, nama: "Belum dialokasikan", persen: 0, utama: fmtIDRRingkas(sisa), sub: sisa === 0 ? "Semua rupiah punya tugas ✓" : `${porsi(sisa)}% penghasilan` });
    else if (basis > 0) potong.push({ warna: ABU, nama: "Belum dibagi", persen: 0, utama: fmtIDRRingkas(sisa), sub: `${100 - porsi(totalKategori)}% penghasilan` });
  } else if (metode === "kakeibo") {
    potong = [
      { warna: IKON.tabungan.warna, nama: "Target tabungan", persen: Math.min(porsi(targetTabungan), 100), utama: fmtIDRRingkas(targetTabungan), sub: basis > 0 ? `${porsi(targetTabungan)}% penghasilan` : null },
      { warna: IKON.kebutuhan.warna, nama: "Bisa dibelanjakan", persen: Math.max(0, 100 - porsi(targetTabungan)), utama: fmtIDRRingkas(Math.max(0, basis - targetTabungan)), sub: "4 pos, tanpa jatah" },
    ];
  } else {
    potong = wadahMetode(metode, metode === "kustom" || metode === "pyf" ? persen : null).map((w) => ({
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
      <div className={s.pratinjauAtas}>
        <span>
          <span className={s.redup}>Penghasilan per bulan</span>
          <strong>{basis > 0 ? fmtIDR(basis) : "Belum ada"}</strong>
          <span className={s.redup}>{ketBasis}</span>
        </span>
        <button type="button" className={s.flat} onClick={onUbah}>
          Ubah
        </button>
      </div>
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
}: {
  userId: string;
  awal: Record<string, number>;
  rerata: Record<string, number>;
  pengaturan: PengaturanMetode;
}) {
  const router = useRouter();
  const { kabari } = useCatat();
  const [metode, setMetode] = useState<Metode>(pengaturan.metode);
  const [persen, setPersen] = useState<Record<KelompokKustom, string>>(
    () => Object.fromEntries(KELOMPOK_KUSTOM.map((k) => [k, String(pengaturan.persen?.[k] ?? PERSEN_AWAL[k])])) as Record<KelompokKustom, string>,
  );
  // Pay Yourself First: persen tabungan; Zero-Based & Kakeibo: target tabungan rupiah.
  const [persenPyf, setPersenPyf] = useState(String(pengaturan.metode === "pyf" ? (pengaturan.persen?.tabungan ?? 20) : 20));
  const [isianTarget, setIsianTarget] = useState(isianNominal(pengaturan.targetTabungan ?? undefined));
  const [galatIsi, setGalatIsi] = useState<string | null>(null);
  const [menyimpanMetode, setMenyimpanMetode] = useState(false);
  // Metode yang benar-benar tersimpan (Kustom baru tersimpan setelah persennya diisi).
  const [tersimpan, setTersimpan] = useState<Metode>(pengaturan.metode);
  // Penghasilan per bulan yang dibagi: diatur sendiri, atau saran aplikasi.
  const [diatur, setDiatur] = useState(pengaturan.penghasilanDiatur);
  const [isianPenghasilan, setIsianPenghasilan] = useState<string | null>(null);
  const basis = diatur ?? pengaturan.saran.nilai;
  const persenGalat = useGalat(persen);
  const angkaPersen = Object.fromEntries(KELOMPOK_KUSTOM.map((k) => [k, Number(persen[k] || 0)])) as Record<KelompokKustom, number>;
  const totalPersen = KELOMPOK_KUSTOM.reduce((t, k) => t + angkaPersen[k], 0);

  /** `target`: target tabungan rupiah (Zero-Based, Kakeibo); undefined = tidak diubah. */
  async function pakaiMetode(m: Metode, p: Partial<Record<KelompokKustom, number>> | null = null, target?: number | null) {
    setMenyimpanMetode(true);
    const { error } = await createSupabaseBrowserClient()
      .from("metode_budget")
      .upsert({ user_id: userId, metode: m, persen: p, ...(target !== undefined ? { target_tabungan: target } : {}), updated_at: new Date().toISOString() });
    setMenyimpanMetode(false);
    if (error) return kabari(dbErrorMessage(error));
    setMetode(m);
    setTersimpan(m);
    kabari(m === "kategori" ? "Memakai budget per kategori" : `Memakai metode ${LABEL_METODE[m].nama}`);
    router.refresh();
  }

  /** null = kembali ikut saran. */
  async function simpanPenghasilan(n: number | null) {
    setMenyimpanMetode(true);
    const { error } = await createSupabaseBrowserClient()
      .from("metode_budget")
      .upsert({ user_id: userId, metode: tersimpan, penghasilan: n, updated_at: new Date().toISOString() });
    setMenyimpanMetode(false);
    if (error) return kabari(dbErrorMessage(error));
    setDiatur(n);
    setIsianPenghasilan(null);
    kabari(n ? "Penghasilan per bulan disimpan" : "Memakai saran penghasilan");
    router.refresh();
  }

  function pilih(m: Metode) {
    setGalatIsi(null);
    // Kustom, PYF, Kakeibo, Zero-Based: isiannya diatur dulu, baru disimpan.
    if (ISI_DULU.includes(m)) return setMetode(m);
    if (m !== metode) void pakaiMetode(m);
  }

  function simpanPyf(e?: FormEvent) {
    e?.preventDefault();
    const n = Number(persenPyf);
    if (!Number.isInteger(n) || n < 1 || n > 90) return setGalatIsi("Persen tabungan 1–90%.");
    setGalatIsi(null);
    void pakaiMetode("pyf", { tabungan: n });
  }

  function simpanKakeibo(e?: FormEvent) {
    e?.preventDefault();
    if (!(Number(isianTarget) > 0)) return setGalatIsi("Isi target tabungan per bulan.");
    setGalatIsi(null);
    void pakaiMetode("kakeibo", null, Number(isianTarget));
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
    const zb = metode === "zero-based";
    const [pasang, lepas, pakai] = await Promise.all([
      cek.simpan.length
        ? db.from("budgets").upsert(cek.simpan.map((b) => ({ ...b, user_id: userId, updated_at: new Date().toISOString() })))
        : { error: null },
      cek.hapus.length ? db.from("budgets").delete().in("category", cek.hapus) : { error: null },
      // Zero-Based: metode & target tabungannya ikut tersimpan di sini.
      zb
        ? db.from("metode_budget").upsert({ user_id: userId, metode: "zero-based", persen: null, target_tabungan: Number(isianTarget) > 0 ? Number(isianTarget) : null, updated_at: new Date().toISOString() })
        : { error: null },
    ]);
    setLoading(false);

    const err = pasang.error ?? lepas.error ?? pakai.error;
    if (err) return setPesan({ jenis: "bahaya", teks: dbErrorMessage(err) });
    if (zb) setTersimpan("zero-based");
    setPesan({ jenis: "sukses", teks: zb ? "Zero-Based tersimpan." : "Budget tersimpan." });
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
        <Pratinjau
          metode={metode}
          persen={metode === "pyf" ? { tabungan: Number(persenPyf) || 0 } : angkaPersen}
          targetTabungan={Number(isianTarget) || 0}
          basis={basis}
          ketBasis={diatur != null ? "Diatur sendiri" : ketSaran(pengaturan.saran)}
          onUbah={() => setIsianPenghasilan(isianNominal(basis || undefined))}
          totalKategori={total}
        />
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
                {KELOMPOK_KUSTOM.map((k) => (
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

        {metode === "pyf" && (
          <form className={s.form} onSubmit={simpanPyf}>
            <GalatForm value={galatIsi ? { pesan: galatIsi, kolom: "pyf" } : null}>
              <div className={`${s.blok} ${s.blokForm}`}>
                <Field label="Tabungan (%)" ikon={PiggyBank} kolom="pyf" keterangan="Disisihkan ke tujuan tabungan begitu gajian. 1–90%, umumnya 20%.">
                  <input inputMode="numeric" value={persenPyf} onChange={(e) => setPersenPyf(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Tabungan (%)" />
                </Field>
              </div>
            </GalatForm>
            <button type="submit" className={s.tombol} disabled={menyimpanMetode}>
              {menyimpanMetode ? <Spinner /> : "Pakai Pay Yourself First"}
            </button>
          </form>
        )}

        {metode === "kakeibo" && (
          <form className={s.form} onSubmit={simpanKakeibo}>
            <GalatForm value={galatIsi ? { pesan: galatIsi, kolom: "kakeibo" } : null}>
              <div className={`${s.blok} ${s.blokForm}`}>
                <Field label="Target tabungan per bulan (Rp)" ikon={PiggyBank} kolom="kakeibo" keterangan="Disisihkan ke tujuan tabungan atau dibelikan emas/reksadana. Berlaku tiap bulan sampai diubah.">
                  <InputNominal value={isianTarget} onChange={setIsianTarget} placeholder="Target tabungan per bulan (Rp)" />
                </Field>
              </div>
            </GalatForm>
            <button type="submit" className={s.tombol} disabled={menyimpanMetode}>
              {menyimpanMetode ? <Spinner /> : "Pakai Kakeibo"}
            </button>
          </form>
        )}

        {metode !== "kategori" && metode !== "zero-based" && (
          <p className={s.redup} style={{ margin: "0 20px" }}>
            Kelompok tiap kategori bisa diubah di Profil → Kategori, dan tiap transaksi di Edit transaksi. Target per kategori tetap tersimpan, dipakai lagi kalau kembali ke Per kategori atau Zero-Based.
          </p>
        )}
      </div>

      {(metode === "kategori" || metode === "zero-based") && (
        <form className={`${s.isi} ${s.form}`} onSubmit={simpan} style={{ marginTop: 16 }}>
          <p className={s.redup} style={{ margin: "0 20px" }}>
            Berlaku sama tiap bulan. Kosongkan kalau kategori itu nggak perlu dibatasi.
          </p>

          {metode === "zero-based" && (
            <div className={`${s.blok} ${s.blokForm}`}>
              <Field label="Tabungan per bulan (Rp)" ikon={PiggyBank} keterangan="Bagian penghasilan yang disisihkan ke tujuan tabungan atau dibelikan emas/reksadana.">
                <InputNominal value={isianTarget} onChange={setIsianTarget} placeholder="Tabungan per bulan (Rp)" />
              </Field>
            </div>
          )}

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

      {isianPenghasilan != null && (
        <Lembar
          judul="Penghasilan per bulan"
          sub="Yang dibagi metode budgeting. Jatahnya tetap sepanjang bulan, kapan pun gajiannya."
          isian={isianPenghasilan}
          onClose={() => !menyimpanMetode && setIsianPenghasilan(null)}
          tombol={
            <>
              <button type="button" className={s.flat} disabled={menyimpanMetode} onClick={() => setIsianPenghasilan(null)}>
                Batal
              </button>
              <span className={s.pilPemisah} aria-hidden />
              <button type="button" className={s.flat} disabled={menyimpanMetode || !(Number(isianPenghasilan) > 0)} onClick={() => void simpanPenghasilan(Number(isianPenghasilan))}>
                {menyimpanMetode ? <Spinner /> : "Simpan"}
              </button>
            </>
          }
        >
          <form
            className={s.form}
            onSubmit={(e) => {
              e.preventDefault();
              if (Number(isianPenghasilan) > 0) void simpanPenghasilan(Number(isianPenghasilan));
            }}
          >
            <div className={`${s.blok} ${s.blokForm}`}>
              <Field
                label="Penghasilan per bulan (Rp)"
                ikon={Banknote}
                keterangan={pengaturan.saran.nilai > 0 ? `Saran ${fmtIDR(pengaturan.saran.nilai)}: ${ketSaran(pengaturan.saran).toLowerCase()}.` : undefined}
              >
                <InputNominal value={isianPenghasilan} onChange={setIsianPenghasilan} placeholder="Penghasilan per bulan (Rp)" />
              </Field>
            </div>
            {diatur != null && pengaturan.saran.nilai > 0 && (
              <button type="button" className={`${s.tombol} ${s.tombolSekunder}`} disabled={menyimpanMetode} onClick={() => void simpanPenghasilan(null)}>
                Pakai saran ({fmtIDRRingkas(pengaturan.saran.nilai)})
              </button>
            )}
            <p className={s.redup} style={{ margin: "0 20px" }}>
              Saran dihitung dari kategori pemasukan yang ditandai sebagai penghasilan (Profil → Kategori). Uang masuk lain seperti pemberian atau refund tidak ikut.
            </p>
          </form>
        </Lembar>
      )}
    </>
  );
}
