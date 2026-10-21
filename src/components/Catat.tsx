"use client";

import { createContext, useContext, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionList, ActionMenu, Banner, Dialog, FormControl, IconButton, TextInput } from "@primer/react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  DeviceCameraIcon,
  FileIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
} from "@primer/octicons-react";
import CameraCapture from "@/components/CameraCapture";
import TransactionFields, { nilaiAwal } from "@/components/TransactionFields";
import DaftarAntrean, { ACCEPT_STRUK, useAntreanStruk } from "@/components/UploadReceiptForm";
import UploadStatementForm from "@/components/UploadStatementForm";
import { fmtIDR, fmtTanggal, labelKategori } from "@/lib/format";
import { TEKS_MAKS, validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction, TransactionType } from "@/types/transaction";

/**
 * Satu pintu untuk semua cara mencatat: tombol "+" (seperti tombol "+" di
 * header GitHub) membuka menu, dan tiap pilihan membuka dialognya sendiri.
 *
 * Sebelumnya beranda memuat semua form sekaligus — foto, ketik, manual, impor
 * PDF — jadi halaman yang mestinya ringkasan malah penuh isian. Pemasukan juga
 * kini pilihan sendiri, bukan tersembunyi di dropdown jenis.
 *
 * Provider ini ditaruh di kerangka aplikasi, jadi menunya bisa dibuka dari
 * halaman mana pun dan antrean struk bertahan saat pindah halaman.
 */

type DialogAktif = "kamera" | "struk" | "ketik" | "manual" | "impor" | null;

interface Kabar {
  judul: string;
  isi?: string;
  href: string;
  draft: boolean;
}

interface CatatApi {
  kamera: () => void;
  galeri: () => void;
  ketik: () => void;
  manual: (type: TransactionType) => void;
  impor: () => void;
}

const CatatContext = createContext<CatatApi | null>(null);

function useCatat(): CatatApi {
  const api = useContext(CatatContext);
  if (!api) throw new Error("useCatat dipakai di luar CatatProvider");
  return api;
}

const POSISI_DIALOG = { narrow: "bottom", regular: "center" } as const;

function ringkas(t: Transaction) {
  return `${t.merchant ?? "Tanpa nama"} — ${fmtIDR(Number(t.amount))} · ${labelKategori(t.category)} · ${fmtTanggal(t.transaction_date)}`;
}

export function CatatProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const antrean = useAntreanStruk();
  const [dialog, setDialog] = useState<DialogAktif>(null);
  const [tipeManual, setTipeManual] = useState<TransactionType>("expense");
  const [kabar, setKabar] = useState<Kabar | null>(null);
  const galeriRef = useRef<HTMLInputElement>(null);

  const api: CatatApi = {
    kamera: () => setDialog("kamera"),
    galeri: () => galeriRef.current?.click(),
    ketik: () => setDialog("ketik"),
    manual: (type) => {
      setTipeManual(type);
      setDialog("manual");
    },
    impor: () => setDialog("impor"),
  };

  function tersimpan(tx: Transaction, draft: boolean) {
    setDialog(null);
    setKabar({
      judul: draft ? "Nggak kebaca, disimpan jadi draft" : "Tercatat",
      isi: draft ? "Nominalnya isi manual ya. Teks yang kamu ketik ikut disimpan." : ringkas(tx),
      href: `/transactions/${tx.id}`,
      draft,
    });
    router.refresh();
  }

  return (
    <CatatContext.Provider value={api}>
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

      {/* Kabar ditaruh lewat slot supaya muncul di atas konten halaman. */}
      <KabarContext.Provider
        value={
          <>
            {kabar && (
              <Banner
                variant={kabar.draft ? "warning" : "success"}
                title={kabar.judul}
                description={kabar.isi}
                onDismiss={() => setKabar(null)}
                primaryAction={
                  <Banner.PrimaryAction onClick={() => router.push(kabar.href)}>
                    {kabar.draft ? "Benerin" : "Lihat"}
                  </Banner.PrimaryAction>
                }
              />
            )}
            {/* Struk yang diproses di belakang dialog yang sudah ditutup. */}
            {antrean.items.length > 0 && dialog !== "struk" && (
              <Banner
                variant={antrean.berjalan ? "info" : "success"}
                title={antrean.berjalan ? `Lagi proses struk, sisa ${antrean.sisa}` : `${antrean.selesai} struk selesai diproses`}
                onDismiss={antrean.berjalan ? undefined : antrean.bersihkan}
                primaryAction={<Banner.PrimaryAction onClick={() => setDialog("struk")}>Lihat hasil</Banner.PrimaryAction>}
              />
            )}
          </>
        }
      >
        {children}
      </KabarContext.Provider>

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
        <Dialog
          title="Struk"
          subtitle={antrean.berjalan ? `Sisa ${antrean.sisa} lagi` : undefined}
          onClose={() => setDialog(null)}
          position={POSISI_DIALOG}
          footerButtons={[
            ...(!antrean.berjalan && antrean.selesai > 0
              ? [{ content: "Bersihkan daftar", onClick: () => { antrean.bersihkan(); setDialog(null); } }]
              : []),
            { buttonType: "primary" as const, content: "Tutup", onClick: () => setDialog(null) },
          ]}
        >
          <DaftarAntrean antrean={antrean} onKamera={api.kamera} onGaleri={api.galeri} />
        </Dialog>
      )}

      {dialog === "ketik" && <KetikDialog onClose={() => setDialog(null)} onTersimpan={tersimpan} />}
      {dialog === "manual" && (
        <ManualDialog type={tipeManual} onClose={() => setDialog(null)} onTersimpan={(tx) => tersimpan(tx, false)} />
      )}

      {dialog === "impor" && (
        <Dialog
          title="Impor rekening koran"
          onClose={() => setDialog(null)}
          position={POSISI_DIALOG}
          footerButtons={[{ content: "Tutup", onClick: () => setDialog(null) }]}
        >
          <UploadStatementForm />
        </Dialog>
      )}
    </CatatContext.Provider>
  );
}

const KabarContext = createContext<React.ReactNode>(null);

/** Tempat kabar sukses dan status struk muncul, di atas konten halaman. */
export function KabarCatat() {
  return <>{useContext(KabarContext)}</>;
}

/**
 * Tombol "+" beserta menunya. `utama` untuk judul beranda (tombol biru
 * berlabel), selain itu ikon kecil untuk header.
 */
export function MenuCatat({ utama = false }: { utama?: boolean }) {
  const catat = useCatat();
  return (
    <ActionMenu>
      {utama ? (
        <ActionMenu.Button variant="primary" leadingVisual={PlusIcon}>
          Catat
        </ActionMenu.Button>
      ) : (
        <ActionMenu.Anchor>
          <IconButton icon={PlusIcon} aria-label="Catat transaksi" />
        </ActionMenu.Anchor>
      )}
      <ActionMenu.Overlay width="medium" align="end">
        <ActionList>
          <ActionList.Group>
            <ActionList.GroupHeading>Dari struk</ActionList.GroupHeading>
            <Pilihan ikon={DeviceCameraIcon} judul="Foto struk" ket="Pakai kamera HP atau laptop" onSelect={catat.kamera} />
            <Pilihan ikon={ImageIcon} judul="Upload gambar" ket="Bisa beberapa sekaligus" onSelect={catat.galeri} />
          </ActionList.Group>
          <ActionList.Divider />
          <ActionList.Group>
            <ActionList.GroupHeading>Catat sendiri</ActionList.GroupHeading>
            <Pilihan ikon={PencilIcon} judul="Ketik cepat" ket="kopi 25rb gopay" onSelect={catat.ketik} />
            <Pilihan ikon={ArrowUpRightIcon} judul="Pengeluaran" ket="Isi rinciannya sendiri" onSelect={() => catat.manual("expense")} />
            <Pilihan ikon={ArrowDownLeftIcon} judul="Pemasukan" ket="Gaji, transferan masuk, dll." onSelect={() => catat.manual("income")} />
          </ActionList.Group>
          <ActionList.Divider />
          <ActionList.Group>
            <ActionList.GroupHeading>Impor</ActionList.GroupHeading>
            <Pilihan ikon={FileIcon} judul="Rekening koran" ket="PDF dari aplikasi bank" onSelect={catat.impor} />
          </ActionList.Group>
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

function Pilihan({
  ikon: Ikon,
  judul,
  ket,
  onSelect,
}: {
  ikon: React.ElementType;
  judul: string;
  ket: string;
  onSelect: () => void;
}) {
  return (
    <ActionList.Item onSelect={onSelect}>
      <ActionList.LeadingVisual>
        <Ikon />
      </ActionList.LeadingVisual>
      {judul}
      <ActionList.Description variant="block">{ket}</ActionList.Description>
    </ActionList.Item>
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
    <Dialog
      title="Ketik cepat"
      subtitle="Nominal, tempat, dan cara bayarnya dibaca otomatis."
      onClose={onClose}
      position={POSISI_DIALOG}
      footerButtons={[
        { content: "Batal", onClick: onClose, disabled: loading },
        { buttonType: "primary", content: "Catat", onClick: () => void kirim(), loading },
      ]}
    >
      <form onSubmit={kirim}>
        <FormControl>
          <FormControl.Label>Transaksinya</FormControl.Label>
          <TextInput
            block
            autoFocus
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            placeholder="kopi 25rb gopay"
            disabled={loading}
          />
          <FormControl.Caption>Contoh: kopi 25rb gopay · gaji masuk 8jt kemarin</FormControl.Caption>
          {error && <FormControl.Validation variant="error">{error}</FormControl.Validation>}
        </FormControl>
      </form>
    </Dialog>
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
    <Dialog
      title={
        nilai.type === "income"
          ? "Catat pemasukan"
          : nilai.type === "transfer"
            ? "Catat pindah kantong"
            : "Catat pengeluaran"
      }
      onClose={onClose}
      width="large"
      position={POSISI_DIALOG}
      footerButtons={[
        { content: "Batal", onClick: onClose, disabled: loading },
        { buttonType: "primary", content: "Simpan", onClick: () => void simpan(), loading },
      ]}
    >
      <form onSubmit={simpan}>
        <TransactionFields nilai={nilai} onChange={(p) => setNilai((v) => ({ ...v, ...p }))} />
        {error && (
          <div style={{ marginTop: "var(--stack-gap-normal)" }}>
            <Banner variant="critical" title="Belum bisa disimpan" hideTitle description={error} />
          </div>
        )}
        {/* Enter di kolom mana pun tetap menyimpan. */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
