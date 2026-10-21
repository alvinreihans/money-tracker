"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Camera, ClipboardPen, History, Image as IkonGambar, Plus } from "lucide-react";
import CameraCapture from "@/components/CameraCapture";
import { Lembar, Pesan, Spinner } from "@/components/oneui";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
import s from "@/components/ui.module.css";
import type { Kantong } from "@/lib/kantong";
import DaftarAntrean, { ACCEPT_STRUK, useAntreanStruk } from "@/components/UploadReceiptForm";
import { fmtIDR, labelKategori } from "@/lib/format";
import { TEKS_MAKS, validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Pintu mencatat. Tombol "+" di tengah navigasi bawah langsung membuka kolom ketik
 * yang sudah siap diketik — "beli makan di warteg 20k shopeepay" lalu kirim, selesai.
 * Mengetik adalah cara tercepat, jadi itu yang langsung muncul; kamera,
 * galeri, dan form isian ada sebagai pintasan di atas kolomnya.
 *
 * Provider ini ditaruh di kerangka aplikasi, jadi antrean struk bertahan saat
 * dialognya ditutup atau saat pindah halaman.
 */

type DialogAktif = "catat" | "kamera" | "struk" | "manual" | null;

interface Kabar {
  teks: string;
  href: string;
  draft: boolean;
}

/** Kantong yang dipilih di form: cukup id, nama, dan jenisnya. */
export type PilihanKantong = Pick<Kantong, "id" | "name" | "kind">;

const CatatContext = createContext<{ buka: () => void; kantong: PilihanKantong[] } | null>(null);

/** Membuka sheet Catat dari mana saja, mis. dari halaman kosong. */
export function useCatat() {
  const api = useContext(CatatContext);
  if (!api) throw new Error("useCatat dipakai di luar CatatProvider");
  return api;
}

/** Tombol + di tengah kapsul navigasi bawah. */
export function TombolCatat() {
  const { buka } = useCatat();
  return (
    <button type="button" className={s.navCatat} aria-label="Catat transaksi" onClick={buka}>
      <Plus size={28} />
    </button>
  );
}

export function CatatProvider({
  saran,
  kantong,
  children,
}: {
  saran: string[];
  kantong: PilihanKantong[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const antrean = useAntreanStruk();
  const [dialog, setDialog] = useState<DialogAktif>(null);
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
    <CatatContext.Provider value={{ buka: () => setDialog("catat"), kantong }}>
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
      </div>

      {dialog === "catat" && (
        <CatatDialog
          saran={saran}
          onClose={() => setDialog(null)}
          onTersimpan={tersimpan}
          onKamera={() => setDialog("kamera")}
          onGaleri={() => {
            setDialog(null);
            galeriRef.current?.click();
          }}
          onForm={() => setDialog("manual")}
        />
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

      {dialog === "manual" && <ManualDialog onClose={() => setDialog(null)} onTersimpan={(tx) => tersimpan(tx, false)} />}
    </CatatContext.Provider>
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

const PINTASAN = [
  { id: "kamera", label: "Kamera", ikon: Camera, warna: "#3e91ff" },
  { id: "galeri", label: "Galeri", ikon: IkonGambar, warna: "#5ecb7a" },
  { id: "form", label: "Manual", ikon: ClipboardPen, warna: "#ff9f43" },
] as const;

function CatatDialog({
  saran,
  onClose,
  onTersimpan,
  onKamera,
  onGaleri,
  onForm,
}: {
  saran: string[];
  onClose: () => void;
  onTersimpan: (tx: Transaction, draft: boolean) => void;
  onKamera: () => void;
  onGaleri: () => void;
  onForm: () => void;
}) {
  const [teks, setTeks] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function kirim(e?: FormEvent) {
    e?.preventDefault();
    const bersih = teks.trim();
    if (!bersih) return;
    if (bersih.length > TEKS_MAKS) return setError(`Maksimal ${TEKS_MAKS} karakter.`);

    setLoading(true);
    setError(null);
    const r = await kirimJson("/api/catat-teks", { text: bersih });
    setLoading(false);

    if (!r.ok) return setError(r.error);
    onTersimpan(r.tx, r.status === "needs_review");
  }

  const aksi = { kamera: onKamera, galeri: onGaleri, form: onForm };

  return (
    <Lembar judul="Catat transaksi" onClose={() => !loading && onClose()}>
      <div className={s.form}>
        <div className={s.pintasan}>
          {PINTASAN.map(({ id, label, ikon: Ikon, warna }) => (
            <button key={id} type="button" className={s.tekan} disabled={loading} onClick={aksi[id]}>
              <span style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
                <Ikon size={22} />
              </span>
              {label}
            </button>
          ))}
        </div>

        {/* Saran hanya sebelum mengetik, seperti saran pencarian One UI.
            Ketukan mengisi kolom — tidak langsung mengirim: nominalnya sering
            beda sedikit, dan salah ketuk berarti transaksi tercatat dua kali. */}
        {saran.length > 0 && !teks && (
          <div className={s.saran} role="group" aria-label="Transaksi terakhir">
            {saran.map((x) => (
              <button
                key={x}
                type="button"
                className={`${s.chip} ${s.tekan}`}
                disabled={loading}
                onClick={() => {
                  setTeks(x);
                  setError(null);
                  inputRef.current?.focus();
                }}
              >
                <History size={14} aria-hidden />
                {x}
              </button>
            ))}
          </div>
        )}

        {/* Kolom ketik di paling bawah sheet: paling dekat dengan keyboard dan
            jempol, seperti kolom pesan di aplikasi chat. */}
        <form onSubmit={kirim} className={s.ketik}>
          <input
            ref={inputRef}
            data-autofocus
            aria-label="Tulis transaksinya"
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            placeholder="beli makan di warteg 20k shopeepay"
            disabled={loading}
            enterKeyHint="send"
            autoComplete="off"
          />
          <button type="submit" className={s.kirim} aria-label="Catat" disabled={loading || !teks.trim()}>
            {loading ? <Spinner /> : <ArrowUp size={22} />}
          </button>
        </form>

        {/* Tanpa keterangan tetap: placeholder-nya sudah memberi contoh, dan
            panduan One UI membuang teks yang tidak membantu user bertindak.
            Baris ini hanya muncul untuk status dan galat. */}
        {error ? (
          <span className={s.galat} role="alert">
            {error}
          </span>
        ) : (
          loading && (
            <span className={s.keterangan} role="status">
              Lagi dibaca...
            </span>
          )
        )}
      </div>
    </Lembar>
  );
}

function ManualDialog({ onClose, onTersimpan }: { onClose: () => void; onTersimpan: (tx: Transaction) => void }) {
  const [nilai, setNilai] = useState(() => nilaiAwal());
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
      posisi="penuh"
      onClose={() => !loading && onClose()}
      pil={[
        { label: "Batal", onClick: onClose, disabled: loading },
        { label: loading ? <Spinner /> : "Simpan", onClick: () => void simpan(), disabled: loading },
      ]}
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
