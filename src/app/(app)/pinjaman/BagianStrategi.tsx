"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Mountain, Percent, Snowflake } from "lucide-react";
import { useCatat } from "@/components/Catat";
import { Field, GalatForm, InputNominal, Lembar, Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { dbErrorMessage } from "@/lib/errors";
import { fmtIDR, isianNominal } from "@/lib/format";
import { bacaBunga, urutPelunasan, type StrategiUtang, type Utang } from "@/lib/pinjaman";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const NAMA_STRATEGI: Record<StrategiUtang, string> = { snowball: "Snowball", avalanche: "Avalanche" };
const KET_STRATEGI: Record<StrategiUtang, string> = {
  snowball: "Yang terkecil dulu, supaya cepat ada yang lunas.",
  avalanche: "Bunga tertinggi dulu, supaya total bunganya paling hemat.",
};
const JENIS: Record<Utang["jenis"], string> = { orang: "Pinjaman", kredit: "Kartu kredit", cicilan: "Cicilan" };
/** "Nanti saja" hanya di perangkat ini; pilihan strategi sendiri tersimpan di akun. */
const KUNCI_NANTI = "strategi-utang-nanti";

/** Yang bunganya diatur: kantong orang/kartu kredit, atau rencana cicilan. */
export interface SasaranBunga {
  tabel: "user_accounts" | "cicilan";
  id: string;
  nama: string;
  bunga: number | null;
}

/** Atur bunga per bulan (SPEC-pelunasan): satu isian; kosong = tanpa bunga. */
export function AturBunga({ sasaran, onClose }: { sasaran: SasaranBunga; onClose: () => void }) {
  const router = useRouter();
  const { kabari } = useCatat();
  const [isian, setIsian] = useState(sasaran.bunga == null ? "" : String(sasaran.bunga).replace(".", ","));
  const [galat, setGalat] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    const cek = bacaBunga(isian);
    if (!cek.ok) return setGalat(cek.error);
    setLoading(true);
    const { error } = await createSupabaseBrowserClient().from(sasaran.tabel).update({ bunga_persen: cek.nilai }).eq("id", sasaran.id);
    setLoading(false);
    if (error) return setGalat(dbErrorMessage(error));
    kabari(cek.nilai == null ? "Bunga dihapus" : "Bunga disimpan");
    onClose();
    router.refresh();
  }

  return (
    <Lembar
      judul={`Bunga ${sasaran.nama}`}
      sub="Opsional. Dipakai untuk urutan Avalanche. Cicilan yang bunganya sudah termasuk di nominal boleh dikosongkan."
      isian={isian}
      onClose={() => !loading && onClose()}
      tombol={
        <>
          <button type="button" className={s.flat} disabled={loading} onClick={onClose}>
            Batal
          </button>
          <span className={s.pilPemisah} aria-hidden />
          <button type="button" className={s.flat} disabled={loading} onClick={() => void simpan()}>
            {loading ? <Spinner /> : "Simpan"}
          </button>
        </>
      }
    >
      <form className={s.form} onSubmit={simpan}>
        <GalatForm value={galat ? { pesan: galat, kolom: "bunga" } : null}>
          <div className={`${s.blok} ${s.blokForm}`}>
            <Field label="Bunga per bulan (%)" ikon={Percent} kolom="bunga" keterangan="Mis. 1,75 untuk kartu kredit. Kosongkan kalau tanpa bunga.">
              <input inputMode="decimal" value={isian} onChange={(e) => setIsian(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))} placeholder="Bunga per bulan (%)" />
            </Field>
          </div>
        </GalatForm>
      </form>
    </Lembar>
  );
}

/**
 * Strategi pelunasan (SPEC-pelunasan): Snowball (terkecil dulu) atau
 * Avalanche (bunga tertinggi dulu) untuk semua utang — orang, kartu kredit,
 * sisa cicilan. Hanya tampil bila ada ≥ 2 utang. Melunasi tetap lewat aksi
 * bayar yang sudah ada; bagian ini hanya menunjukkan urutan dan ke mana uang
 * ekstra sebaiknya pergi.
 */
export default function BagianStrategi({
  userId,
  utang,
  strategi,
  ekstra,
  onAturBunga,
}: {
  userId: string;
  utang: Utang[];
  strategi: StrategiUtang | null;
  ekstra: number | null;
  onAturBunga: (u: Utang) => void;
}) {
  const router = useRouter();
  const { kabari } = useCatat();
  const [nanti, setNanti] = useState(true);
  const [isianEkstra, setIsianEkstra] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    try {
      setNanti(localStorage.getItem(KUNCI_NANTI) === "1");
    } catch {
      setNanti(false);
    }
  }, []);

  async function simpan(isi: { strategi_utang?: StrategiUtang | null; ekstra_utang?: number | null }, pesan: string) {
    setLoading(true);
    // Baris metode_budget per user; metode budget tidak tersentuh (bawaan 'kategori' bila belum ada).
    const { error } = await createSupabaseBrowserClient()
      .from("metode_budget")
      .upsert({ user_id: userId, ...isi, updated_at: new Date().toISOString() });
    setLoading(false);
    if (error) return kabari(dbErrorMessage(error));
    kabari(pesan);
    setIsianEkstra(null);
    router.refresh();
  }

  if (utang.length < 2) return null;

  if (!strategi) {
    if (nanti) return null;
    return (
      <>
        <h2 className={s.subheader}>Strategi pelunasan</h2>
        <div className={`${s.blok} ${s.blokIsi}`}>
          <p style={{ margin: "0 0 12px" }}>Mau lunas lebih cepat? Pilih urutan melunasinya:</p>
          {(["snowball", "avalanche"] as const).map((x) => (
            <button
              key={x}
              type="button"
              className={`${s.baris} ${s.tekan}`}
              style={{ padding: "8px 0" }}
              disabled={loading}
              onClick={() => void simpan({ strategi_utang: x }, `Memakai strategi ${NAMA_STRATEGI[x]}`)}
            >
              <span className={s.barisIkon} aria-hidden>
                {x === "snowball" ? <Snowflake size={20} /> : <Mountain size={20} />}
              </span>
              <span className={s.barisTeks}>
                <span className={s.barisJudul}>{NAMA_STRATEGI[x]}</span>
                <span className={s.redup} style={{ whiteSpace: "normal" }}>
                  {KET_STRATEGI[x]}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            className={s.flat}
            onClick={() => {
              try {
                localStorage.setItem(KUNCI_NANTI, "1");
              } catch {}
              setNanti(true);
            }}
          >
            Nanti saja
          </button>
        </div>
      </>
    );
  }

  const urut = urutPelunasan(utang, strategi);
  const lain: StrategiUtang = strategi === "snowball" ? "avalanche" : "snowball";
  return (
    <>
      <h2 className={s.subheader}>Strategi pelunasan · {NAMA_STRATEGI[strategi]}</h2>
      <div className={s.blok}>
        <p className={s.redup} style={{ margin: 0, padding: "14px 20px 4px", whiteSpace: "normal" }}>
          {KET_STRATEGI[strategi]} Bayar minimum untuk yang lain, lebihnya ke urutan pertama.
        </p>
        {urut.map((u, i) => (
          <button key={u.id} type="button" className={`${s.baris} ${s.tekan}`} onClick={() => onAturBunga(u)} aria-label={`${i + 1}. ${u.nama}, ${fmtIDR(u.jumlah)}. Atur bunga`}>
            <span className={s.barisIkon} aria-hidden style={i === 0 ? { background: "color-mix(in srgb, var(--primer) 18%, transparent)", color: "var(--primer)" } : undefined}>
              {i + 1}
            </span>
            <span className={s.barisTeks}>
              <span className={s.barisJudul}>
                {u.nama}
                {i === 0 && (
                  <span className={s.chip} style={{ marginLeft: 8, fontSize: 12, padding: "2px 8px" }}>
                    Fokus
                  </span>
                )}
              </span>
              <span className={`${s.redup} ${u.alasan === "bunga belum diisi" ? s.peringatan : ""}`}>
                {[JENIS[u.jenis], u.alasan ?? (u.bunga != null ? `bunga ${u.bunga.toLocaleString("id-ID")}%/bln` : null)].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className={s.nominal}>{fmtIDR(u.jumlah)}</span>
          </button>
        ))}
        <button type="button" className={`${s.baris} ${s.tekan}`} onClick={() => setIsianEkstra(isianNominal(ekstra ?? undefined))}>
          <span className={s.barisIkon} aria-hidden>
            <Banknote size={20} />
          </span>
          <span className={s.barisTeks}>
            <span className={s.barisJudul}>Uang ekstra per bulan</span>
            <span className={s.redup} style={{ whiteSpace: "normal" }}>
              {ekstra ? `${fmtIDR(ekstra)} ekstra → ke ${urut[0].nama}` : "Opsional: berapa yang bisa ditambahkan tiap bulan"}
            </span>
          </span>
        </button>
        <div className={s.aksiKartu} style={{ padding: "0 12px 8px" }}>
          <button type="button" className={s.flat} disabled={loading} onClick={() => void simpan({ strategi_utang: lain }, `Memakai strategi ${NAMA_STRATEGI[lain]}`)}>
            Ganti ke {NAMA_STRATEGI[lain]}
          </button>
          <button type="button" className={s.flat} disabled={loading} onClick={() => void simpan({ strategi_utang: null }, "Strategi pelunasan dimatikan")}>
            Matikan
          </button>
        </div>
      </div>

      {isianEkstra != null && (
        <Lembar
          judul="Uang ekstra per bulan"
          sub={`Ditambahkan ke ${urut[0].nama} tiap bulan, di luar pembayaran minimum.`}
          isian={isianEkstra}
          onClose={() => !loading && setIsianEkstra(null)}
          tombol={
            <>
              <button type="button" className={s.flat} disabled={loading} onClick={() => setIsianEkstra(null)}>
                Batal
              </button>
              <span className={s.pilPemisah} aria-hidden />
              <button
                type="button"
                className={s.flat}
                disabled={loading}
                onClick={() => void simpan({ ekstra_utang: Number(isianEkstra) > 0 ? Number(isianEkstra) : null }, "Uang ekstra disimpan")}
              >
                {loading ? <Spinner /> : "Simpan"}
              </button>
            </>
          }
        >
          <div className={`${s.blok} ${s.blokForm}`}>
            <Field label="Uang ekstra per bulan (Rp)" ikon={Banknote} keterangan="Kosongkan kalau tidak ada.">
              <InputNominal value={isianEkstra} onChange={setIsianEkstra} placeholder="Uang ekstra per bulan (Rp)" />
            </Field>
          </div>
        </Lembar>
      )}
    </>
  );
}
