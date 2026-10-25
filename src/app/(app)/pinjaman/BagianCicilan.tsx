"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CalendarClock, CalendarDays, Check, ListChecks, NotebookPen, Package, Shapes, Store, Trash2, Wallet } from "lucide-react";
import { useKategori } from "@/components/Catat";
import { tandaKategori } from "@/components/kategori";
import { Field, InputNominal, Konfirmasi, Lembar, Pesan, Pilih, Segmen, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, fmtTanggal, fmtTanggalPendek, isianNominal, isoLokal } from "@/lib/format";
import { emojiKantong, type Kantong } from "@/lib/kantong";
import { kategoriJenis, LAINNYA } from "@/lib/kategori";
import { bagiRata, jadwalCicilan, kantongUang, statusCicilan, type Angsuran, type Cicilan } from "@/lib/pinjaman";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type KantongSaldo = Kantong & { saldo: number };

const SARAN_PENYEDIA = ["Shopee PayLater", "GoPayLater", "Kredivo", "Akulaku", "Atome"];

/**
 * Cicilan (paylater & cicilan kartu kredit). Belanjanya tidak dihitung
 * pengeluaran; tiap cicilan yang dibayar menjadi pengeluaran biasa dengan
 * kategori rencananya (keputusan di SPEC-lend-borrow.md).
 */
export default function BagianCicilan({
  userId,
  hariIni,
  cicilan,
  dibayar,
  kantong,
  baru,
  onTutupBaru,
}: {
  userId: string;
  hariIni: string;
  cicilan: Cicilan[];
  dibayar: Record<string, number[]>;
  kantong: KantongSaldo[];
  /** Form rencana baru terbuka (dipicu pintasan "Cicilan" di atas). */
  baru: boolean;
  onTutupBaru: () => void;
}) {
  const router = useRouter();
  const [aksi, setAksi] = useState<Cicilan | null>(null);
  // Bayar: rencananya & berapa cicilan sekaligus yang dipilih di awal.
  const [bayar, setBayar] = useState<{ rencana: Cicilan; jumlah: number } | null>(null);
  const [jadwal, setJadwal] = useState<Cicilan | null>(null);
  const [hapus, setHapus] = useState<Cicilan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pembayar: kantong uang dan kartu kredit (untuk cicilan kartu).
  const pembayar = kantong.filter((k) => kantongUang(k) || k.kind === "kredit");

  async function hapusRencana() {
    if (!hapus) return;
    setLoading(true);
    const { error: err } = await createSupabaseBrowserClient().from("cicilan").delete().eq("id", hapus.id);
    setLoading(false);
    if (err) return setError(dbErrorMessage(err));
    setHapus(null);
    router.refresh();
  }

  const aktif = cicilan.filter((c) => !statusCicilan(c, dibayar[c.id] ?? [], hariIni).lunas);
  const lunas = cicilan.filter((c) => statusCicilan(c, dibayar[c.id] ?? [], hariIni).lunas);

  const baris = (c: Cicilan) => {
    const st = statusCicilan(c, dibayar[c.id] ?? [], hariIni);
    return (
      <button key={c.id} type="button" className={`${s.baris} ${s.tekan}`} onClick={() => setAksi(c)}>
        <span className={s.barisIkon} style={{ background: "color-mix(in srgb, #3e91ff 18%, transparent)", color: "#3e91ff" }} aria-hidden>
          <CalendarClock size={20} />
        </span>
        <span className={s.barisTeks}>
          <span className={s.barisJudul}>{c.nama}</span>
          <span className={`${s.redup} ${st.telat ? s.bahaya : ""}`}>
            {st.lunas
              ? `Lunas · ${c.tenor}× ${c.penyedia ?? ""}`.trim()
              : `${st.terbayar}/${c.tenor} · ${st.telat ? "telat sejak" : "berikutnya"} ${fmtTanggalPendek(st.berikutnya!.jatuhTempo)}`}
          </span>
        </span>
        <span className={s.nominal}>{fmtIDR(Number(c.nominal))}</span>
      </button>
    );
  };

  return (
    <>
      {aktif.length > 0 && (
        <>
          <h2 className={s.subheader}>
            Cicilan · sisa {fmtIDR(aktif.reduce((t, c) => t + statusCicilan(c, dibayar[c.id] ?? [], hariIni).sisaNominal, 0))}
          </h2>
          <div className={s.blok}>{aktif.map(baris)}</div>
        </>
      )}
      {lunas.length > 0 && (
        <>
          <h2 className={s.subheader}>Cicilan lunas</h2>
          <div className={s.blok}>{lunas.map(baris)}</div>
        </>
      )}

      {aksi && (
        <Lembar judul={aksi.nama} daftar onClose={() => setAksi(null)}>
          {(() => {
            const st = statusCicilan(aksi, dibayar[aksi.id] ?? [], hariIni);
            const pilihan = [
              ...(st.berikutnya
                ? [{ label: `Bayar cicilan ke-${st.berikutnya.ke} · ${fmtIDR(Number(aksi.nominal))}`, ikon: Banknote, jalan: () => setBayar({ rencana: aksi, jumlah: 1 }) }]
                : []),
              // Seperti di aplikasi paylater: sisa cicilan boleh dilunasi sekaligus.
              ...(st.sisa > 1
                ? [{ label: `Lunasi ${st.sisa} cicilan sisa · ${fmtIDR(st.sisaNominal)}`, ikon: Check, jalan: () => setBayar({ rencana: aksi, jumlah: st.sisa }) }]
                : []),
              { label: "Lihat jadwal", ikon: ListChecks, jalan: () => setJadwal(aksi) },
              { label: "Hapus rencana", ikon: Trash2, jalan: () => setHapus(aksi) },
            ];
            return pilihan.map(({ label, ikon: Ikon, jalan }) => (
              <button
                key={label}
                type="button"
                className={s.baris}
                onClick={() => {
                  setAksi(null);
                  setError(null);
                  jalan();
                }}
              >
                <span className={s.barisIkon} aria-hidden>
                  <Ikon size={20} />
                </span>
                <span className={s.barisJudul}>{label}</span>
              </button>
            ));
          })()}
        </Lembar>
      )}

      {jadwal && (
        <Lembar judul={`Jadwal ${jadwal.nama}`} daftar onClose={() => setJadwal(null)}>
          {jadwalCicilan(jadwal, dibayar[jadwal.id] ?? []).map((a) => (
            <div key={a.ke} className={s.baris} style={{ minHeight: 52 }}>
              <span className={s.barisTeks}>
                <span>Cicilan ke-{a.ke}</span>
                <span className={!a.dibayar && a.jatuhTempo < hariIni ? s.bahaya : s.redup}>{fmtTanggal(a.jatuhTempo)}</span>
              </span>
              {a.dibayar ? (
                <span className={s.masuk} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Check size={18} aria-hidden /> Dibayar
                </span>
              ) : (
                <span className={s.nominal}>{fmtIDR(Number(jadwal.nominal))}</span>
              )}
            </div>
          ))}
        </Lembar>
      )}

      {hapus && (
        <Konfirmasi
          tanya={`Hapus rencana cicilan “${hapus.nama}”?`}
          ya="Hapus"
          loading={loading}
          error={error}
          onBatal={() => setHapus(null)}
          onYa={() => void hapusRencana()}
        >
          Cicilan yang sudah dibayar tetap tercatat sebagai pengeluaran.
        </Konfirmasi>
      )}

      {bayar && (
        <FormBayar
          rencana={bayar.rencana}
          belum={jadwalCicilan(bayar.rencana, dibayar[bayar.rencana.id] ?? []).filter((a) => !a.dibayar)}
          jumlahAwal={bayar.jumlah}
          pembayar={pembayar}
          onClose={() => setBayar(null)}
        />
      )}

      {baru && <FormRencana userId={userId} pembayar={pembayar} onClose={onTutupBaru} />}
    </>
  );
}

/**
 * Bayar cicilan: pengeluaran biasa (kategori rencana) yang menempel ke
 * rencananya. Boleh beberapa sekaligus (1, 2, … semua sisa) — tercatat satu
 * pengeluaran per cicilan, nominalnya dibagi rata (SPEC-paylater).
 */
function FormBayar({
  rencana,
  belum,
  jumlahAwal,
  pembayar,
  onClose,
}: {
  rencana: Cicilan;
  /** Cicilan yang belum dibayar, urut nomor. */
  belum: Angsuran[];
  jumlahAwal: number;
  pembayar: KantongSaldo[];
  onClose: () => void;
}) {
  const router = useRouter();
  const kategori = useKategori();
  const [jumlah, setJumlah] = useState(Math.min(jumlahAwal, belum.length));
  const dipilih = belum.slice(0, jumlah);
  const ke = dipilih[0];
  const pilihanJumlah = [...new Set([1, 2, 3, belum.length])].filter((n) => n <= belum.length).sort((a, b) => a - b);
  const [nominal, setNominal] = useState(isianNominal(jumlah * Number(rencana.nominal)));
  const [kantongId, setKantongId] = useState(rencana.kantong_id ?? pembayar.find((k) => k.bawaan)?.id ?? "");
  const [tanggal, setTanggal] = useState(isoLokal(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    if (!kantongId) return setError("Pilih kantongnya dulu.");
    setLoading(true);
    setError(null);
    // Kategori rencana bisa sudah dihapus: jatuh ke Lainnya.
    const category = kategoriJenis(kategori, "expense").some((k) => k.slug === rencana.category) ? rencana.category : LAINNYA;
    const bagian = bagiRata(Number(nominal), dipilih.length);
    // Satu per cicilan, berurutan: yang gagal berhenti di situ, yang sudah
    // tersimpan tetap (cicilan itu memang sudah dibayar).
    for (const [i, a] of dipilih.entries()) {
      const res = await fetch("/api/catat-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: bagian[i],
          type: "expense",
          category,
          transaction_date: tanggal,
          merchant: rencana.nama,
          description: `Cicilan ${a.ke}/${rencana.tenor}${rencana.penyedia ? ` · ${rencana.penyedia}` : ""}`,
          kantong_id: kantongId,
          cicilan_id: rencana.id,
          cicilan_ke: a.ke,
        }),
      }).catch(() => null);
      const hasil = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      if (!res?.ok) {
        setLoading(false);
        if (i > 0) router.refresh();
        return setError(`${i > 0 ? `Cicilan ke-${a.ke} gagal disimpan (yang sebelumnya sudah). ` : ""}${hasil?.error ?? "Gagal nyimpen."}`);
      }
    }
    onClose();
    router.refresh();
  }

  return (
    <Lembar
      judul={jumlah > 1 ? `Bayar cicilan ke-${ke.ke}–${dipilih[jumlah - 1].ke}` : `Bayar cicilan ke-${ke.ke}`}
      sub={jumlah > 1 ? `${rencana.nama} · ${jumlah} cicilan sekaligus` : `${rencana.nama} · jatuh tempo ${fmtTanggal(ke.jatuhTempo)}`}
      posisi="penuh"
      isian={[jumlah, nominal, kantongId, tanggal]}
      onClose={() => !loading && onClose()}
      pil={[
        { label: "Batal", batal: true, disabled: loading },
        { label: loading ? <Spinner /> : "Bayar", onClick: () => void simpan(), disabled: loading },
      ]}
    >
      <form onSubmit={simpan} className={s.form}>
        {belum.length > 1 && (
          <Segmen
            label="Berapa cicilan"
            pilihan={pilihanJumlah.map((n) => ({ id: String(n), label: n === belum.length && n > 1 ? `Semua (${n})` : `${n} cicilan` }))}
            nilai={String(jumlah)}
            onChange={(id) => {
              setJumlah(Number(id));
              setNominal(isianNominal(Number(id) * Number(rencana.nominal)));
            }}
          />
        )}
        <div className={`${s.blok} ${s.blokForm}`}>
          <Field label="Nominal (Rp)" ikon={Banknote} keterangan={jumlah > 1 ? "Ubah kalau pelunasannya lebih murah atau lebih mahal." : undefined}>
            <InputNominal required value={nominal} onChange={setNominal} placeholder="Nominal (Rp)" />
          </Field>
          <Pilih
            label="Bayar pakai"
            ikon={Wallet}
            nilai={kantongId}
            kosong="Pilih kantong"
            pilihan={pembayar.map((k) => ({ id: k.id, label: k.name, emoji: emojiKantong(k) }))}
            onChange={setKantongId}
          />
          <Field label="Tanggal bayar" ikon={CalendarDays}>
            <input type="date" required value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </Field>
        </div>
        <p className={s.redup} style={{ margin: "0 20px" }}>
          {jumlah > 1
            ? `Dicatat sebagai ${jumlah} pengeluaran ${rencana.nama}, satu per cicilan.`
            : `Dicatat sebagai pengeluaran ${rencana.nama} bulan ini.`}
        </p>
        {error && <Pesan jenis="bahaya">{error}</Pesan>}
        <button type="submit" hidden />
      </form>
    </Lembar>
  );
}

/** Rencana cicilan baru. Belanjanya sendiri tidak dicatat sebagai pengeluaran. */
function FormRencana({ userId, pembayar, onClose }: { userId: string; pembayar: KantongSaldo[]; onClose: () => void }) {
  const router = useRouter();
  const kategori = useKategori();
  const keluar = kategoriJenis(kategori, "expense");
  const [isian, setIsian] = useState({
    nama: "",
    penyedia: "",
    category: keluar.find((k) => k.slug === "shopping")?.slug ?? LAINNYA,
    nominal: "",
    tenor: "",
    jatuh_tempo_awal: isoLokal(new Date()),
    kantong_id: pembayar.find((k) => k.bawaan)?.id ?? "",
    catatan: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ubah = (p: Partial<typeof isian>) => setIsian((v) => ({ ...v, ...p }));
  const tenor = Number(isian.tenor);
  const kartu = pembayar.filter((k) => k.kind === "kredit").map((k) => k.name);

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const nama = isian.nama.trim();
    if (!nama) return setError("Nama barangnya diisi dulu.");
    if (!(Number(isian.nominal) > 0)) return setError("Nominal per bulannya harus lebih dari nol.");
    if (!(Number.isInteger(tenor) && tenor >= 1 && tenor <= 120)) return setError("Tenornya 1–120 bulan.");
    setLoading(true);
    const { error: err } = await createSupabaseBrowserClient()
      .from("cicilan")
      .insert({
        user_id: userId,
        nama,
        penyedia: isian.penyedia.trim() || null,
        category: isian.category,
        nominal: Number(isian.nominal),
        tenor,
        jatuh_tempo_awal: isian.jatuh_tempo_awal,
        kantong_id: isian.kantong_id || null,
        catatan: isian.catatan.trim() || null,
      });
    setLoading(false);
    if (err) return setError(dbErrorMessage(err));
    onClose();
    router.refresh();
  }

  return (
    <Lembar
      judul="Cicilan baru"
      posisi="penuh"
      isian={isian}
      onClose={() => !loading && onClose()}
      pil={[
        { label: "Batal", batal: true, disabled: loading },
        { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
      ]}
    >
      <form onSubmit={simpan} className={s.form}>
        <div className={`${s.blok} ${s.blokForm}`}>
          <Field label="Nama barang" ikon={Package}>
            <input required maxLength={60} value={isian.nama} onChange={(e) => ubah({ nama: e.target.value })} placeholder="Nama barang" />
          </Field>
          <Field label="Penyedia" ikon={Store}>
            <input maxLength={60} value={isian.penyedia} onChange={(e) => ubah({ penyedia: e.target.value })} placeholder="Penyedia" />
          </Field>
          <div className={s.chipsBungkus} style={{ padding: "0 20px 8px 60px" }}>
            {[...SARAN_PENYEDIA, ...kartu].map((p) => (
              <button key={p} type="button" className={`${s.chip} ${s.tekan}`} aria-pressed={isian.penyedia === p} onClick={() => ubah({ penyedia: p })}>
                {p}
              </button>
            ))}
          </div>
          <Pilih
            label="Kategori"
            ikon={Shapes}
            nilai={isian.category}
            pilihan={keluar.map((k) => ({ id: k.slug, label: k.name, ...tandaKategori(k) }))}
            onChange={(category) => ubah({ category })}
          />
        </div>

        <div className={`${s.blok} ${s.blokForm}`}>
          <Field label="Cicilan per bulan (Rp)" ikon={Banknote} keterangan="Yang ditagihkan tiap bulan, sudah termasuk bunga/biaya.">
            <InputNominal required value={isian.nominal} onChange={(nominal) => ubah({ nominal })} placeholder="Cicilan per bulan (Rp)" />
          </Field>
          <Field label="Tenor (bulan)" ikon={ListChecks} keterangan={tenor > 0 && Number(isian.nominal) > 0 ? `Total ${fmtIDR(tenor * Number(isian.nominal))}` : undefined}>
            <input
              inputMode="numeric"
              value={isian.tenor}
              onChange={(e) => ubah({ tenor: e.target.value.replace(/\D/g, "").slice(0, 3) })}
              placeholder="Tenor (bulan)"
            />
          </Field>
          <Field label="Jatuh tempo pertama" ikon={CalendarClock} keterangan="Bulan berikutnya di tanggal yang sama.">
            <input type="date" required value={isian.jatuh_tempo_awal} onChange={(e) => ubah({ jatuh_tempo_awal: e.target.value })} />
          </Field>
          <Pilih
            label="Biasanya dibayar pakai"
            ikon={Wallet}
            nilai={isian.kantong_id}
            kosong="Pilih kantong"
            pilihan={pembayar.map((k) => ({ id: k.id, label: k.name, emoji: emojiKantong(k) }))}
            onChange={(kantong_id) => ubah({ kantong_id })}
          />
          <Field label="Catatan" ikon={NotebookPen}>
            <textarea rows={1} value={isian.catatan} onChange={(e) => ubah({ catatan: e.target.value })} placeholder="Catatan" />
          </Field>
        </div>

        <p className={s.redup} style={{ margin: "0 20px" }}>
          Belanjanya tidak dicatat sekarang. Tiap cicilan yang dibayar masuk sebagai pengeluaran di bulan itu.
        </p>
        {error && <Pesan jenis="bahaya">{error}</Pesan>}
        <button type="submit" hidden />
      </form>
    </Lembar>
  );
}
