"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Camera, FileText, Image as IkonGambar, PencilLine, Plus } from "lucide-react";
import CameraCapture from "@/components/CameraCapture";
import { Field, Lembar, Pesan, Spinner } from "@/components/oneui";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
import s from "@/components/ui.module.css";
import DaftarAntrean, { ACCEPT_STRUK, useAntreanStruk } from "@/components/UploadReceiptForm";
import UploadStatementForm, { useImporRekeningKoran } from "@/components/UploadStatementForm";
import { fmtIDR, labelKategori } from "@/lib/format";
import { TEKS_MAKS, validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction, TransactionType } from "@/types/transaction";

/**
 * Satu pintu untuk semua cara mencatat: tombol "+" melayang (FAB) di kanan
 * bawah — dalam jangkauan jempol — membuka dialog pilihan di bawah layar,
 * dan tiap pilihan membuka dialognya sendiri.
 *
 * Provider ini ditaruh di kerangka aplikasi, jadi antrean struk bertahan saat
 * dialognya ditutup atau saat pindah halaman.
 */

type DialogAktif = "pilih" | "kamera" | "struk" | "ketik" | "manual" | "impor" | null;

interface Kabar {
  teks: string;
  href: string;
  draft: boolean;
}

interface CatatApi {
  buka: () => void;
}

const CatatContext = createContext<CatatApi | null>(null);

/** Membuka dialog pilihan "+" dari mana saja, mis. dari halaman kosong. */
export function useCatat(): CatatApi {
  const api = useContext(CatatContext);
  if (!api) throw new Error("useCatat dipakai di luar CatatProvider");
  return api;
}

export function CatatProvider({ fab, children }: { fab: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const antrean = useAntreanStruk();
  const impor = useImporRekeningKoran();
  const [dialog, setDialog] = useState<DialogAktif>(null);
  const [tipeManual, setTipeManual] = useState<TransactionType>("expense");
  const [kabar, setKabar] = useState<Kabar | null>(null);
  const galeriRef = useRef<HTMLInputElement>(null);

  // Snackbar hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (!kabar) return;
    const t = setTimeout(() => setKabar(null), 5000);
    return () => clearTimeout(t);
  }, [kabar]);

  function tersimpan(tx: Transaction, draft: boolean) {
    setDialog(null);
    setKabar({
      teks: draft
        ? "Nggak kebaca, disimpan jadi draft"
        : `Tercatat: ${tx.merchant ?? labelKategori(tx.category)} ${fmtIDR(Number(tx.amount))}`,
      href: `/transactions/${tx.id}`,
      draft,
    });
    router.refresh();
  }

  function tutupStruk() {
    setDialog(null);
    // Hasilnya sudah dilihat; yang masih jalan tetap di antrean.
    if (!antrean.berjalan) antrean.bersihkan();
  }

  const statusStruk =
    antrean.items.length > 0 && dialog !== "struk"
      ? antrean.berjalan
        ? `Lagi proses struk · sisa ${antrean.sisa}`
        : `${antrean.selesai} struk selesai diproses`
      : null;

  return (
    <CatatContext.Provider value={{ buka: () => setDialog("pilih") }}>
      <input
        ref={galeriRef}
        type="file"
        multiple
        accept={ACCEPT_STRUK}
        hidden
        onChange={(e) => {
          antrean.tambah(Array.from(e.target.files ?? []));
          setDialog("struk");
          // Reset supaya memilih file yang sama dua kali tetap memicu onChange.
          e.target.value = "";
        }}
      />

      {children}

      <div className={s.lapisBawah}>
        {statusStruk && (
          <div className={s.snackbar} role="status">
            {antrean.berjalan && <span className={s.spinner} aria-hidden style={{ flex: "none" }} />}
            <span>{statusStruk}</span>
            <button type="button" onClick={() => setDialog("struk")}>
              Lihat
            </button>
          </div>
        )}
        {kabar && (
          <div className={s.snackbar} role="status">
            <span>{kabar.teks}</span>
            <button type="button" onClick={() => router.push(kabar.href)}>
              {kabar.draft ? "Benerin" : "Lihat"}
            </button>
          </div>
        )}
        {fab && (
          <button type="button" className={s.fab} aria-label="Catat transaksi" onClick={() => setDialog("pilih")}>
            <Plus size={28} />
          </button>
        )}
      </div>

      {dialog === "pilih" && (
        <Lembar
          judul="Catat transaksi"
          daftar
          onClose={() => setDialog(null)}
          tombol={
            <button type="button" className={s.flat} onClick={() => setDialog(null)}>
              Batal
            </button>
          }
        >
          <h3 className={s.subheader} style={{ margin: "4px 0 4px" }}>Dari struk</h3>
          <Pilihan ikon={Camera} judul="Foto struk" ket="Pakai kamera HP atau laptop" onClick={() => setDialog("kamera")} />
          <Pilihan
            ikon={IkonGambar}
            judul="Upload gambar"
            ket="Bisa beberapa sekaligus"
            onClick={() => {
              setDialog(null);
              galeriRef.current?.click();
            }}
          />
          <h3 className={s.subheader} style={{ margin: "12px 0 4px" }}>Catat sendiri</h3>
          <Pilihan ikon={PencilLine} judul="Ketik cepat" ket="kopi 25rb gopay" onClick={() => setDialog("ketik")} />
          <Pilihan
            ikon={ArrowUpRight}
            judul="Pengeluaran"
            ket="Isi rinciannya sendiri"
            onClick={() => {
              setTipeManual("expense");
              setDialog("manual");
            }}
          />
          <Pilihan
            ikon={ArrowDownLeft}
            judul="Pemasukan"
            ket="Gaji, transferan masuk, dll."
            onClick={() => {
              setTipeManual("income");
              setDialog("manual");
            }}
          />
          <h3 className={s.subheader} style={{ margin: "12px 0 4px" }}>Impor</h3>
          <Pilihan ikon={FileText} judul="Rekening koran" ket="PDF dari aplikasi bank" onClick={() => setDialog("impor")} />
        </Lembar>
      )}

      {dialog === "kamera" && (
        <CameraCapture
          onCapture={(file) => {
            antrean.tambah([file]);
            setDialog("struk");
          }}
          onClose={() => setDialog(antrean.items.length ? "struk" : null)}
        />
      )}

      {dialog === "struk" && (
        <Lembar
          judul="Struk"
          sub={antrean.berjalan ? `Sisa ${antrean.sisa} lagi` : undefined}
          onClose={tutupStruk}
          tombol={
            <button type="button" className={s.flat} onClick={tutupStruk}>
              Tutup
            </button>
          }
        >
          <DaftarAntrean antrean={antrean} onKamera={() => setDialog("kamera")} onGaleri={() => galeriRef.current?.click()} />
        </Lembar>
      )}

      {dialog === "ketik" && <KetikDialog onClose={() => setDialog(null)} onTersimpan={tersimpan} />}

      {dialog === "manual" && (
        <ManualDialog type={tipeManual} onClose={() => setDialog(null)} onTersimpan={(tx) => tersimpan(tx, false)} />
      )}

      {dialog === "impor" && (
        <Lembar
          judul="Impor rekening koran"
          onClose={() => !impor.loading && setDialog(null)}
          tombol={
            <>
              <button type="button" className={s.flat} disabled={impor.loading} onClick={() => setDialog(null)}>
                Tutup
              </button>
              <button
                type="button"
                className={s.flat}
                disabled={!impor.file || impor.loading}
                onClick={() => void impor.impor()}
              >
                {impor.loading ? <Spinner /> : "Impor"}
              </button>
            </>
          }
        >
          <UploadStatementForm impor={impor} />
        </Lembar>
      )}
    </CatatContext.Provider>
  );
}

function Pilihan({
  ikon: Ikon,
  judul,
  ket,
  onClick,
}: {
  ikon: React.ElementType;
  judul: string;
  ket: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={s.baris} onClick={onClick}>
      <span className={s.barisIkon}>
        <Ikon size={20} />
      </span>
      <span className={s.barisTeks}>
        <span className={s.barisJudul}>{judul}</span>
        <span className={s.redup}>{ket}</span>
      </span>
    </button>
  );
}

async function kirimJson(url: string, body: unknown) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      transaction?: Transaction;
      status?: Transaction["status"];
    };
    if (res.ok && data.transaction) return { ok: true as const, tx: data.transaction, status: data.status };
    return { ok: false as const, error: data.error ?? "Gagal nyimpen." };
  } catch {
    return { ok: false as const, error: "Koneksinya bermasalah." };
  }
}

function KetikDialog({
  onClose,
  onTersimpan,
}: {
  onClose: () => void;
  onTersimpan: (tx: Transaction, draft: boolean) => void;
}) {
  const [teks, setTeks] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function kirim(e?: FormEvent) {
    e?.preventDefault();
    const bersih = teks.trim();
    if (!bersih) return setError("Teksnya masih kosong.");
    if (bersih.length > TEKS_MAKS) return setError(`Maksimal ${TEKS_MAKS} karakter.`);

    setLoading(true);
    setError(null);
    const r = await kirimJson("/api/catat-teks", { text: bersih });
    setLoading(false);

    if (!r.ok) return setError(r.error);
    onTersimpan(r.tx, r.status === "needs_review");
  }

  return (
    <Lembar
      judul="Ketik cepat"
      sub="Nominal, tempat, dan cara bayarnya dibaca otomatis."
      onClose={() => !loading && onClose()}
      tombol={
        <>
          <button type="button" className={s.flat} disabled={loading} onClick={onClose}>
            Batal
          </button>
          <button type="button" className={s.flat} disabled={loading} onClick={() => void kirim()}>
            {loading ? <Spinner /> : "Catat"}
          </button>
        </>
      }
    >
      <form onSubmit={kirim}>
        <Field label="Transaksinya" keterangan="Contoh: kopi 25rb gopay · gaji masuk 8jt kemarin" galat={error}>
          <input
            autoFocus
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            placeholder="kopi 25rb gopay"
            disabled={loading}
            enterKeyHint="send"
          />
        </Field>
      </form>
    </Lembar>
  );
}

function ManualDialog({
  type,
  onClose,
  onTersimpan,
}: {
  type: TransactionType;
  onClose: () => void;
  onTersimpan: (tx: Transaction) => void;
}) {
  const [nilai, setNilai] = useState(() => nilaiAwal(undefined, type));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e?: FormEvent) {
    e?.preventDefault();
    // Dicek di sini dulu supaya pesan salahnya langsung muncul; server tetap
    // memeriksa ulang dengan fungsi yang sama.
    const cek = validasiTransaksi({ ...nilai });
    if (!cek.ok) return setError(cek.error);

    setLoading(true);
    setError(null);
    const r = await kirimJson("/api/catat-manual", cek.data);
    setLoading(false);

    if (!r.ok) return setError(r.error);
    onTersimpan(r.tx);
  }

  return (
    <Lembar
      judul={
        nilai.type === "income"
          ? "Catat pemasukan"
          : nilai.type === "transfer"
            ? "Catat pindah kantong"
            : "Catat pengeluaran"
      }
      onClose={() => !loading && onClose()}
      tombol={
        <>
          <button type="button" className={s.flat} disabled={loading} onClick={onClose}>
            Batal
          </button>
          <button type="button" className={s.flat} disabled={loading} onClick={() => void simpan()}>
            {loading ? <Spinner /> : "Simpan"}
          </button>
        </>
      }
    >
      <form onSubmit={simpan} className={s.form}>
        <TransactionFields nilai={nilai} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />
        {error && <Pesan jenis="bahaya">{error}</Pesan>}
        {/* Enter di kolom mana pun tetap menyimpan. */}
        <button type="submit" hidden />
      </form>
    </Lembar>
  );
}
