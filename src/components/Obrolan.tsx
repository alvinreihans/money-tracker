"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarClock,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardPen,
  History,
  Paperclip,
  ReceiptText,
  SendHorizontal,
  X,
} from "lucide-react";
import CameraCapture from "@/components/CameraCapture";
import EditTransactionForm from "@/components/EditTransactionForm";
import KartuPeriksa from "@/components/KartuPeriksa";
import { tandaTransaksi } from "@/components/kategori";
import { BarisPilih, Spinner } from "@/components/oneui";
import PecahTransaksi, { bacaUsulan, ringkasUsulan } from "@/components/PecahTransaksi";
import s from "@/components/ui.module.css";
import { adalahPdf, useCatat } from "@/components/Catat";
import { useTawaranSerupa } from "@/components/TawaranSerupa";
import { ACCEPT_STRUK } from "@/components/UploadReceiptForm";
import { bacaBukti, kalimatArah, rapikanNama } from "@/lib/arah";
import { urungkanPindah } from "@/components/CalonPindah";
import { bakukanPaylater } from "@/lib/paylater-nama";
import { buangDraft, urungkanBuang, type SalinanDraft } from "@/lib/buang-draft";
import { bacaPetunjuk, usulanKantongBaru } from "@/lib/petunjuk";
import type { KantongBaru, UsulanPindahBukti } from "@/lib/pindah-server";
import {
  apakahKoreksi,
  bacaNominal,
  CERITA_ULANG,
  KALIMAT_TANYA,
  kalimatKartu,
  LABEL_KURANG,
  kalimatTanya,
  MAKS_CERITA,
  mauHapus,
  pertanyaanDraft,
  PILIHAN_TENOR,
  tanggalHapusDraft,
  type JenisTanya,
} from "@/lib/draft";
import { alamatDetail, angkaMentah, angkaRibuan, fmtIDR, fmtTanggalPendek } from "@/lib/format";
import { kantongDeposito } from "@/lib/kantong";
import { namaKategori } from "@/lib/kategori";
import { daftarLembar } from "@/lib/riwayat-lembar";
import { UMUR_DRAFT_HARI } from "@/lib/notifikasi";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Cicilan } from "@/lib/pinjaman";
import { TEKS_MAKS } from "@/lib/transaksi-input";
import { saldoSejak } from "@/lib/waktu";
import type { HasilLengkapi, UsulanLengkapi } from "@/lib/lengkapi-server";
import type { ExtractedReceipt, Transaction } from "@/types/transaction";

/**
 * Catat sebagai obrolan (docs/specs/SPEC-catat-chat.md): lembar yang bisa membesar.
 * Ringkas = pintasan + kolom ketik seperti dulu; besar = obrolan satu
 * transaksi, atau daftar catatan yang belum selesai.
 *
 * Satu gambar/teks = satu transaksi = satu sesi. Yang kurang ditanya di
 * tempat; begitu lengkap, kartu "Periksa dulu" (SPEC-periksa-dulu): Simpan |
 * Ubah | Buang — belum ada yang dihitung sebelum Simpan. Sesudah Simpan, kartu
 * Tersimpan (Batalkan | Ubah), atau Ubah | Selesai lalu lembar menutup sendiri
 * bila tadi ada yang ditanyakan — sama dari mana pun datangnya (ketik, kamera,
 * galeri, bagikan, daftar).
 */

/** Lama hitung mundur penutup perbaikan (detik). */
const TUTUP_DETIK = 8;

/** Lama kartu hasil catatan lengkap tampil di lembar ringkas (milidetik). */
const KARTU_RINGKAS_MS = 5000;

type Pesan =
  | { t: "saya"; teks: string }
  | { t: "foto"; src: string }
  | { t: "app"; teks: string; sub?: string }
  | { t: "status"; teks: string }
  | {
      t: "tanya";
      /** "buat": "Kantong 'GoPay' belum ada. Buat sekarang?"; "saldo": saldo kantong yang baru dibuat (SPEC-kantong-sendiri A-1, K1). */
      jenis: JenisTanya | "manual" | "buat" | "saldo";
      teks: string;
      selesai?: boolean;
      kandidat?: { id: string; label: string }[];
      /** "buat": nama kantong yang ditawarkan & pertanyaan asalnya. */
      buat?: string;
      untuk?: JenisTanya;
    }
  // Screenshot sisi lawan pindah antar rekening sendiri (B-7): "Jadikan pindah BRI → DANA".
  | { t: "pindahBukti"; u: UsulanPindahBukti; hasil: ExtractedReceipt; file: File; keterangan: string; selesai?: boolean; memproses?: boolean }
  | { t: "dipindah"; arah: string; salinan: unknown[]; diurungkan?: boolean }
  // "Lengkapi transaksi ini?" (SPEC-lengkapi §2): belum ada yang disimpan sampai dipilih.
  | {
      t: "lengkapi";
      u: UsulanLengkapi;
      hasil: ExtractedReceipt;
      sidik: string | null;
      file: File;
      keterangan: string;
      pilih: string;
      ganti: boolean;
      buat: boolean;
      selesai?: boolean;
      /** "Melengkapi…" di kartu selama permintaan berjalan (SPEC-perbaikan-uiux #14). */
      memproses?: boolean;
    }
  | { t: "dilengkapi"; r: HasilLengkapi; diurungkan?: boolean }
  | { t: "kartu"; tx: Transaction; perbaikan: boolean; batal?: boolean }
  // Kartu "Periksa dulu" (SPEC-periksa-dulu §1): draft lengkap yang belum tersimpan.
  | { t: "periksa"; tx: Transaction; foto: string | null; selesai?: boolean }
  // Draft yang dibuang dari kartu periksa, bisa diurungkan.
  | { t: "dibuang"; salinan: SalinanDraft; diurungkan?: boolean }
  | { t: "koreksi"; id: string; perubahan: string[]; sebelum: Partial<Transaction>; dibatalkan?: boolean; dihapus?: boolean }
  | { t: "cicilan"; c: Cicilan }
  | { t: "tutup"; lagi: number; teks?: string };

interface Aktif {
  tx: Transaction;
  jenis: JenisTanya;
  /** Putaran "cerita"; lewat MAKS_CERITA ditawari isi manual. */
  ronde: number;
}

interface Draft {
  id: string;
  dibuat: string;
  adaFoto: boolean;
  tx: Transaction;
}

/**
 * Ketikan transaksi baru yang belum dikirim disimpan seperti draf di Samsung
 * Messages: menutup lembar Catat tidak membuangnya (SPEC-catat-tuntas).
 */
const KUNCI_DRAF = "catat-draf";
const bacaDraf = () => {
  try {
    return localStorage.getItem(KUNCI_DRAF) ?? "";
  } catch {
    return "";
  }
};

/** Cara lembar dibuka. Ganti `id` = lembar baru (sesi bersih). */
export interface PerintahCatat {
  id: number;
  besar: boolean;
  layar: "obrolan" | "daftar";
  teks?: string;
  draft?: string;
}


/** Dalam WIB seperti cron & pengingat H+7, bukan tanggal lokal browser. */
const tanggalHapus = (dibuat: string) => fmtTanggalPendek(tanggalHapusDraft(dibuat));

async function kirimJson(url: string, body: unknown) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { status: 0, data: { error: "Koneksinya bermasalah." } };
  }
}

export default function LembarCatat({
  perintah,
  saran,
  jumlahDraft,
  onClose,
  onManual,
}: {
  perintah: PerintahCatat;
  saran: string[];
  jumlahDraft: number;
  onClose: () => void;
  onManual: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { kantong, kategori, tambahRekening, tambahStruk, tambahKantong, periksaPindah } = useCatat();
  const serupa = useTawaranSerupa();
  // Struk campuran yang sedang dipecah dari kartu hasilnya (SPEC-tawar-pecah).
  const [pecah, setPecah] = useState<Transaction | null>(null);
  // Saldo kantong berlaku sejak jam berapa: menentukan perlu tanya jam atau tidak.
  const saldoDari = useCallback(
    (id: string) => {
      const k = kantong.find((x) => x.id === id);
      return k?.saldo_per ? saldoSejak({ saldo_per: k.saldo_per, saldo_sejak: k.saldo_sejak }) : undefined;
    },
    [kantong],
  );
  const db = useMemo(() => createSupabaseBrowserClient(), []);

  const [besar, setBesar] = useState(perintah.besar);
  const [layar, setLayar] = useState(perintah.layar);
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [aktif, setAktif] = useState<Aktif | null>(null);
  const [teks, setTeks] = useState(() => perintah.teks || (perintah.draft || perintah.layar !== "obrolan" ? "" : bacaDraf()));
  const [lampiran, setLampiran] = useState<{ file: File; url: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [ringkas, setRingkas] = useState<{ tx: Transaction; batal?: boolean } | null>(null);
  // "+ Tambah cerita" (SPEC-cerita-tanya): transaksi yang sedang diberi cerita;
  // ketikan berikutnya jadi keterangannya.
  const [cerita, setCerita] = useState<Transaction | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [detik, setDetik] = useState<number | null>(null);
  const [kamera, setKamera] = useState(false);
  const [dariDaftar, setDariDaftar] = useState(false);
  // Kantong yang dibuat di tempat di obrolan ini (A-1): sesudah catatannya selesai ditanya
  // saldonya sekali (K1). `tanyaSaldo` = pertanyaan saldo yang sedang terbuka.
  const kantongSesi = useRef<KantongBaru[]>([]);
  const [tanyaSaldo, setTanyaSaldo] = useState<{ k: KantongBaru; lagi: number } | null>(null);
  // Form Ubah dari kartu periksa (menyimpan form = Simpan) dan tombol Simpan yang sedang berjalan.
  const [ubah, setUbah] = useState<{ tx: Transaction; ikutan: { id: string; amount: number } | null; i: number } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  // Thumbnail catatan yang sedang dibahas (foto yang dikirim, atau foto draft), untuk kartu periksa.
  const fotoRef = useRef<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const badanRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const judulRef = useRef<HTMLHeadingElement>(null);
  const galeriRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string[]>([]);

  // Hanya ketikan transaksi baru; jawaban atas pertanyaan ("BCA") tidak
  // disimpan, supaya tidak muncul lagi sebagai transaksi baru. Begitu dikirim,
  // kolomnya kosong → drafnya ikut terhapus.
  const ketikanBaru = !aktif && !perintah.draft && !cerita;
  useEffect(() => {
    if (!ketikanBaru) return;
    try {
      if (teks.trim()) localStorage.setItem(KUNCI_DRAF, teks);
      else localStorage.removeItem(KUNCI_DRAF);
    } catch {
      // Penyimpanan diblokir (mode privat): drafnya hanya hilang, tidak apa-apa.
    }
  }, [teks, ketikanBaru]);

  const tambah = (...p: Pesan[]) => setPesan((prev) => [...prev, ...p]);
  const sesiBaru = () => {
    setPesan([]);
    setAktif(null);
    setDetik(null);
    setRingkas(null);
  };

  // Object URL foto tidak dibebaskan otomatis.
  useEffect(() => () => urlRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Obrolan selalu menampilkan pesan terbaru.
  useEffect(() => {
    const b = badanRef.current;
    if (b && besar && layar === "obrolan") b.scrollTop = b.scrollHeight;
  }, [pesan, besar, layar]);

  const muatDaftar = useCallback(async () => {
    setDrafts(null);
    const { data: meta } = await db.from("draft_catat").select("transaksi_id, dibuat, ada_foto").order("dibuat", { ascending: false });
    const ids = (meta ?? []).map((m) => m.transaksi_id as string);
    const { data: txs } = ids.length ? await db.from("transactions").select("*").in("id", ids) : { data: [] };
    const per = new Map(((txs ?? []) as Transaction[]).map((t) => [t.id, t]));
    setDrafts(
      (meta ?? []).flatMap((m) => {
        const tx = per.get(m.transaksi_id as string);
        return tx ? [{ id: tx.id, dibuat: m.dibuat as string, adaFoto: Boolean(m.ada_foto), tx }] : [];
      }),
    );
  }, [db]);

  /**
   * Chip jawaban "kirim atau terima?" (SPEC-catat-tuntas). "Pindah antar
   * rekeningku" selalu ada (SPEC-kantong-sendiri B-3); kantong yang belum ada
   * ditawarkan dibuat di pertanyaan berikutnya.
   */
  function pilihanArah(tx: Transaction) {
    const b = bacaBukti(tx.bukti_transfer);
    const depan = (n: string | null) => rapikanNama(n)?.split(" ")[0];
    const ke = b && depan(b.penerima.nama);
    const dari = b && depan(b.pengirim.nama);
    const kirim = ke ? `Aku kirim ke ${ke}` : "Uang keluar";
    const terima = dari ? `Aku terima dari ${dari}` : "Uang masuk";
    return (
      <div className={s.pilihanJawab}>
        <button type="button" onClick={() => void jawab("kirim", kirim)}>{kirim}</button>
        <button type="button" onClick={() => void jawab("terima", terima)}>{terima}</button>
        <button type="button" onClick={() => void jawab("pindah", "Pindah antar rekeningku")}>
          Pindah antar rekeningku
        </button>
      </div>
    );
  }

  /** Ajukan pertanyaan untuk draft yang sedang dibahas. */
  function mulaiTanya(tx: Transaction, jenis: JenisTanya, ronde: number) {
    setAktif({ tx, jenis, ronde });
    // Kartu periksa lama tidak berlaku lagi (koreksi membuka pertanyaan atau kartu baru).
    setPesan((prev) => prev.map((p) => (p.t === "periksa" ? { ...p, selesai: true } : p)));
    // Semua sudah terisi: kartu "Periksa dulu", bukan pertanyaan (SPEC-periksa-dulu §1).
    if (jenis === "konfirmasi") {
      tambah({ t: "periksa", tx, foto: fotoRef.current });
      return;
    }
    if (jenis === "duplikat" && tx.duplikat_dari) {
      // Tunjukkan transaksi yang sudah tercatat, supaya user bisa memutuskan;
      // dari gambar, beserta transaksi lain yang mungkin pasangannya (SPEC-lengkapi §4).
      const dariGambar = tx.source === "receipt" || tx.source === "payment_proof";
      const duplikatDari = tx.duplikat_dari;
      void Promise.all([
        db
          .from("transactions")
          .select("merchant, amount, type, category, transaction_date, waktu, payment_method")
          .eq("id", duplikatDari)
          .maybeSingle(),
        dariGambar
          ? fetch(`/api/lengkapi/kandidat?draft=${tx.id}`)
              .then((r) => r.json())
              .then((d: { kandidat?: { id: string; label: string }[] }) => d.kandidat ?? [])
              .catch(() => [] as { id: string; label: string }[])
          : Promise.resolve([] as { id: string; label: string }[]),
      ]).then(([{ data: o }, kandidat]) => {
          if (kandidat.length > 1) {
            tambah({ t: "tanya", jenis, teks: "Sepertinya ini salah satu transaksi yang sudah tercatat. Lengkapi yang mana, atau catat lagi?", kandidat });
            return;
          }
          const apa = o
            ? [
                o.merchant ?? namaKategori(kategori, o.category, o.type),
                fmtIDR(Number(o.amount)),
                `${fmtTanggalPendek(o.transaction_date)}${o.waktu ? ` ${String(o.waktu).slice(0, 5).replace(":", ".")}` : ""}`,
                o.payment_method,
              ]
                .filter(Boolean)
                .join(" · ")
            : null;
          tambah({ t: "tanya", jenis, teks: apa ? `Sepertinya ini sudah tercatat: ${apa}. Catat lagi?` : KALIMAT_TANYA.duplikat, kandidat: o ? [{ id: duplikatDari, label: apa ?? "" }] : [] });
        });
      return;
    }
    if (jenis === "cicilan") {
      // "Bayar cicilan Shopee PayLater yang mana?" (D-2): rencana penyedia itu.
      const penyedia = bacaPetunjuk(tx.bukti_transfer).cicilan;
      void db
        .from("cicilan")
        .select("id, nama, penyedia, nominal")
        .then(({ data }) => {
          const kandidat = ((data ?? []) as { id: string; nama: string; penyedia: string | null; nominal: number }[])
            .filter((c) => c.penyedia && bakukanPaylater(c.penyedia) === penyedia)
            .map((c) => ({ id: c.id, label: `${c.nama} · ${fmtIDR(Number(c.nominal))}` }));
          tambah({ t: "tanya", jenis, teks: kalimatTanya(jenis, tx), kandidat });
        });
      return;
    }
    if (jenis === "cerita" && ronde >= MAKS_CERITA) {
      tambah({ t: "tanya", jenis: "manual", teks: "Masih belum kebaca nih. Isi manual aja?" });
    } else {
      const teks =
        jenis === "cerita" && ronde > 0
          ? CERITA_ULANG
          : jenis === "tenor" && tx.paylater
            ? `Pakai ${tx.paylater} ya. ${KALIMAT_TANYA.tenor}`
            : jenis === "arah" && bacaBukti(tx.bukti_transfer)
              ? kalimatArah(bacaBukti(tx.bukti_transfer)!)
              : jenis === "kartu" && tx.merchant
                ? kalimatKartu(tx.merchant)
                : kalimatTanya(jenis, tx);
      tambah({ t: "tanya", jenis, teks });
    }
  }

  /** Hasil catatan baru (teks/foto): lengkap → kartu; kurang → percakapan. */
  function terimaHasil(data: Record<string, unknown>, status: number, foto?: { file: File; keterangan: string }) {
    if (data.cicilan) return void cicilanDibuat(data.cicilan as Cicilan);
    // Gambar yang sama / pengenal yang sama sudah dipakai (SPEC-lengkapi §5).
    const dipakai = data.dipakai as { id: string; label: string; draft: boolean } | undefined;
    if (dipakai) {
      tambah({
        t: "app",
        teks: dipakai.draft ? "Gambar ini sudah dikirim dan menunggu di “Belum selesai”." : "Struk ini sudah dipakai untuk melengkapi transaksi ini, jadi tidak dicatat lagi:",
        sub: dipakai.label,
      });
      return;
    }
    // Sisi lawan pindah antar rekening sendiri yang sudah tercatat (SPEC-kantong-sendiri B-7).
    const pb = data.pindahBukti as UsulanPindahBukti | undefined;
    if (pb && foto && data.hasil) {
      setBesar(true);
      setLayar("obrolan");
      tambah({ t: "pindahBukti", u: pb, hasil: data.hasil as ExtractedReceipt, file: foto.file, keterangan: foto.keterangan });
      return;
    }
    // Cocok dengan transaksi yang sudah tercatat: tawarkan Lengkapi (SPEC-lengkapi §2).
    const u = data.lengkapi as UsulanLengkapi | undefined;
    if (u && foto && data.hasil) {
      setBesar(true);
      setLayar("obrolan");
      tambah({
        t: "lengkapi",
        u,
        hasil: data.hasil as ExtractedReceipt,
        sidik: (data.sidik as string | undefined) ?? null,
        file: foto.file,
        keterangan: foto.keterangan,
        pilih: u.kandidat[0].id,
        ganti: false,
        buat: Boolean(u.cashback?.buat),
      });
      return;
    }
    const tx = data.transaction as Transaction | undefined;
    if (!tx) {
      tambah({ t: "app", teks: (data.error as string) ?? "Gagal nyimpen. Coba lagi ya." });
      return;
    }
    const jenis = data.pertanyaan as JenisTanya | null;
    router.refresh();
    if (!jenis && status < 300 && tx.status === "confirmed") {
      tambah({ t: "kartu", tx, perbaikan: false });
      if (!besar) setRingkas({ tx });
      return;
    }
    // Lengkap -> kartu periksa di tempat (lembar ringkas tetap ringkas: Enter = Simpan, K2);
    // ada yang kurang -> obrolan besar.
    const j = jenis ?? "konfirmasi";
    if (j !== "konfirmasi") {
      setBesar(true);
      setLayar("obrolan");
    }
    mulaiTanya(tx, j, 0);
  }

  async function catatTeks(isi: string) {
    sesiBaru();
    fotoRef.current = null;
    tambah({ t: "saya", teks: isi });
    setSibuk(true);
    if (besar) tambah({ t: "status", teks: "Membaca…" });
    const r = await kirimJson("/api/catat-teks", { text: isi });
    setPesan((prev) => prev.filter((p) => p.t !== "status"));
    setSibuk(false);
    terimaHasil(r.data, r.status);
  }

  async function catatFoto(file: File, url: string, keterangan: string) {
    sesiBaru();
    fotoRef.current = url;
    setBesar(true);
    setLayar("obrolan");
    tambah({ t: "foto", src: url }, ...(keterangan ? [{ t: "saya", teks: keterangan } as Pesan] : []), { t: "status", teks: "Membaca struk…" });
    setSibuk(true);
    const fd = new FormData();
    fd.append("file", file);
    if (keterangan) fd.append("keterangan", keterangan);
    let status = 0;
    let data: Record<string, unknown>;
    try {
      const res = await fetch("/api/upload-receipt", { method: "POST", body: fd });
      status = res.status;
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      data = { error: "Koneksinya bermasalah." };
    }
    setPesan((prev) => prev.filter((p) => p.t !== "status"));
    setSibuk(false);
    terimaHasil(data, status, { file, keterangan });
  }

  const ubahPesan = (i: number, isi: Partial<Extract<Pesan, { t: "lengkapi" }>>) =>
    setPesan((prev) => prev.map((p, j) => (j === i && p.t === "lengkapi" ? { ...p, ...isi } : p)));

  /** Kartu Lengkapi: isi transaksi yang dipilih dari gambar ini; nominal, tanggal, kantong tetap. */
  async function lengkapiDariKartu(i: number) {
    const p = pesan[i];
    if (p?.t !== "lengkapi" || sibuk) return;
    ubahPesan(i, { selesai: true, memproses: true });
    tambah({ t: "saya", teks: "Lengkapi" });
    setSibuk(true);
    const r = await kirimJson("/api/lengkapi", { id: p.pilih, hasil: p.hasil, sidik: p.sidik, gantiKategori: p.ganti, buatDompet: p.buat });
    setSibuk(false);
    ubahPesan(i, { memproses: false });
    if (r.status !== 200 || !r.data.transaction) {
      ubahPesan(i, { selesai: false });
      return tambah({ t: "app", teks: (r.data.error as string) ?? "Gagal melengkapi transaksinya." });
    }
    tambah({ t: "dilengkapi", r: r.data as unknown as HasilLengkapi });
    router.refresh();
    // Gambar pelengkapnya masuk "Cara dicatat" transaksi itu (SPEC-periksa-dulu K1). Pelengkap saja.
    const fd = new FormData();
    fd.append("file", p.file);
    fd.append("hasil", JSON.stringify(p.hasil));
    void fetch(`/api/transaksi/${p.pilih}/jejak`, { method: "POST", body: fd }).catch(() => null);
  }

  /** Kartu Lengkapi → "Catat sebagai baru": hasil baca yang sama dikirim balik, tanpa AI lagi. */
  async function catatSebagaiBaru(i: number) {
    const p = pesan[i];
    if ((p?.t !== "lengkapi" && p?.t !== "pindahBukti") || sibuk) return;
    setPesan((prev) => prev.map((x, j) => (j === i && (x.t === "lengkapi" || x.t === "pindahBukti") ? { ...x, selesai: true } : x)));
    tambah({ t: "saya", teks: "Catat sebagai baru" }, { t: "status", teks: "Mencatat…" });
    setSibuk(true);
    const fd = new FormData();
    fd.append("file", p.file);
    fd.append("baru", "1");
    fd.append("hasil", JSON.stringify(p.hasil));
    if (p.keterangan) fd.append("keterangan", p.keterangan);
    let status = 0;
    let data: Record<string, unknown>;
    try {
      const res = await fetch("/api/upload-receipt", { method: "POST", body: fd });
      status = res.status;
      data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      data = { error: "Koneksinya bermasalah." };
    }
    setPesan((prev) => prev.filter((x) => x.t !== "status"));
    setSibuk(false);
    terimaHasil(data, status);
  }

  const ubahPindah = (i: number, isi: Partial<Extract<Pesan, { t: "pindahBukti" }>>) =>
    setPesan((prev) => prev.map((p, j) => (j === i && p.t === "pindahBukti" ? { ...p, ...isi } : p)));

  /** Kartu B-7: transaksi rekening koran itu jadi pindah kantong; gambar ini tidak dicatat baru. */
  async function jadikanPindahBukti(i: number) {
    const p = pesan[i];
    if (p?.t !== "pindahBukti" || sibuk) return;
    ubahPindah(i, { selesai: true, memproses: true });
    tambah({ t: "saya", teks: `Jadikan pindah ${p.u.arah}` });
    setSibuk(true);
    const r = await kirimJson("/api/kantong/pindah/bukti", { id: p.u.id, updated_at: p.u.updated_at, kantong_lawan: p.u.kantong_lawan, merchant: p.u.merchant });
    setSibuk(false);
    ubahPindah(i, { memproses: false });
    if (r.status !== 200 || !Array.isArray(r.data.salinan)) {
      ubahPindah(i, { selesai: false });
      return tambah({ t: "app", teks: (r.data.error as string) ?? "Gagal menjadikan pindah kantong." });
    }
    tambah({ t: "dipindah", arah: p.u.arah, salinan: r.data.salinan as unknown[] });
    router.refresh();
  }

  async function urungkanDipindah(i: number) {
    const p = pesan[i];
    if (p?.t !== "dipindah" || sibuk) return;
    setSibuk(true);
    const galat = await urungkanPindah(p.salinan);
    setSibuk(false);
    if (galat) return tambah({ t: "app", teks: galat });
    setPesan((prev) => prev.map((x, j) => (j === i && x.t === "dipindah" ? { ...x, diurungkan: true } : x)));
    router.refresh();
  }

  /** Urungkan Lengkapi dari kartu hasilnya. */
  async function urungkanLengkapi(i: number) {
    const p = pesan[i];
    if (p?.t !== "dilengkapi" || sibuk) return;
    setSibuk(true);
    const r = await kirimJson("/api/lengkapi/urungkan", { id: p.r.transaction.id, sebelum: p.r.sebelum, ikutan_id: p.r.ikutan_id, kantong_baru: p.r.kantong_baru });
    setSibuk(false);
    if (r.status !== 200) return tambah({ t: "app", teks: (r.data.error as string) ?? "Gagal mengurungkan." });
    setPesan((prev) => prev.map((x, j) => (j === i && x.t === "dilengkapi" ? { ...x, diurungkan: true } : x)));
    router.refresh();
  }

  /** Draft "sudah tercatat?" → "Lengkapi yang sudah ada" (SPEC-lengkapi §4): draft-nya dihapus. */
  async function lengkapiYangAda(id: string, label: string) {
    if (!aktif || sibuk) return;
    const draft = aktif.tx;
    setPesan((prev) => prev.map((p) => (p.t === "tanya" ? { ...p, selesai: true } : p)));
    tambah({ t: "saya", teks: label });
    setSibuk(true);
    const r = await kirimJson("/api/lengkapi", { id, draft: draft.id });
    setSibuk(false);
    if (r.status !== 200 || !r.data.transaction) {
      setPesan((prev) => {
        const j = prev.findLastIndex((p) => p.t === "tanya");
        return prev.map((p, k) => (k === j && p.t === "tanya" ? { ...p, selesai: false } : p));
      });
      return tambah({ t: "app", teks: (r.data.error as string) ?? "Gagal melengkapi transaksinya." });
    }
    setAktif(null);
    const { count } = await db.from("draft_catat").select("transaksi_id", { count: "exact", head: true });
    tambah({ t: "dilengkapi", r: r.data as unknown as HasilLengkapi }, { t: "tutup", lagi: count ?? 0, teks: "Sip, transaksi yang sudah ada dilengkapi — tidak dicatat dua kali." });
    setDetik(TUTUP_DETIK);
    router.refresh();
  }

  async function jawab(nilai: string, label?: string, jenisPaksa?: JenisTanya) {
    if (!aktif || sibuk) return;
    const jenis = jenisPaksa ?? aktif.jenis;
    setPesan((prev) => prev.map((p) => (p.t === "tanya" ? { ...p, selesai: true } : p)));
    tambah({ t: "saya", teks: label ?? (jenis === "nominal" ? `Rp ${angkaRibuan(angkaMentah(nilai))}` : nilai) });
    setSibuk(true);
    // Ketikan yang bukan jawaban langsung juga dibaca ulang oleh AI.
    if (jenis === "cerita" || !label) tambah({ t: "status", teks: "Membaca ulang…" });
    const r = await kirimJson(`/api/draft/${aktif.tx.id}/jawab`, { jenis, nilai, label });
    setPesan((prev) => prev.filter((p) => p.t !== "status"));
    setSibuk(false);

    if (r.status === 422 && typeof r.data.buat === "string") {
      // Kantong yang diketik belum ada (A-1): "Buat sekarang?" — bukan pertanyaan yang sama lagi.
      tambah({ t: "tanya", jenis: "buat", teks: r.data.error as string, buat: r.data.buat, untuk: jenis });
      return;
    }
    if (r.status === 422) {
      // Jawaban tidak bisa dipakai: dibalas, pertanyaannya dibuka lagi.
      tambah({ t: "app", teks: r.data.error as string });
      setPesan((prev) => {
        const i = prev.findLastIndex((p) => p.t === "tanya");
        return prev.map((p, j) => (j === i && p.t === "tanya" ? { ...p, selesai: false } : p));
      });
      return;
    }
    if (r.data.cicilan) return cicilanDibuat(r.data.cicilan as Cicilan);
    const tx = r.data.transaction as Transaction | undefined;
    if (!tx) {
      setAktif(null);
      tambah({ t: "app", teks: (r.data.error as string) ?? "Gagal nyimpen jawabannya." });
      return;
    }
    // Kantong yang baru dibuat di tempat (A-1): langsung ada di pilihan kantong, ditanya saldonya nanti (K1),
    // dan transaksi rekening koran lama yang pindah ke/dari situ ditawarkan sesudah lembar ini tutup (A-3).
    const baru = r.data.kantong_baru as KantongBaru | null | undefined;
    if (baru) {
      tambahKantong(baru);
      kantongSesi.current.push(baru);
      if (["bank", "ewallet", "cash"].includes(baru.kind)) periksaPindah([baru.id]);
      tambah({ t: "app", teks: `Kantong ${baru.name} dibuat.`, sub: "Mulai Rp 0 — nanti aku tanya saldonya." });
    }
    // Tidak ada yang kurang lagi -> kartu periksa (SPEC-periksa-dulu §1); tersimpan baru lewat Simpan.
    const lanjut = (r.data.pertanyaan as JenisTanya | null) ?? "konfirmasi";
    if (lanjut !== "konfirmasi" && !besar) {
      setBesar(true);
      setLayar("obrolan");
    }
    router.refresh();
    mulaiTanya(tx, lanjut, jenis === "cerita" ? aktif.ronde + 1 : aktif.ronde);
  }

  /** Kartu periksa → Simpan: ikut dihitung (logika selesai bersama di server). */
  async function simpanPeriksa(i: number) {
    const p = pesan[i];
    if (p?.t !== "periksa" || p.selesai || sibuk) return;
    setSibuk(true);
    setMenyimpan(true);
    const r = await kirimJson(`/api/draft/${p.tx.id}/simpan`, {});
    setSibuk(false);
    setMenyimpan(false);
    const tx = r.data.transaction as Transaction | undefined;
    if (r.status === 409 && typeof r.data.pertanyaan === "string") {
      // Ternyata masih ada yang kurang (mis. kantongnya baru dihapus): ditanyakan dulu.
      setPesan((prev) => prev.map((x, j) => (j === i && x.t === "periksa" ? { ...x, selesai: true } : x)));
      setBesar(true);
      setLayar("obrolan");
      return mulaiTanya(p.tx, r.data.pertanyaan as JenisTanya, aktif?.ronde ?? 0);
    }
    if (r.status !== 200 || !tx) return tambah({ t: "app", teks: (r.data.error as string) ?? "Gagal menyimpan. Coba lagi." });
    await sesudahSimpan(i, tx);
  }

  /**
   * Sesudah Simpan (kartu atau form Ubah): kartu "✓ Tersimpan". Langsung lengkap →
   * Batalkan | Ubah (lembar ringkas: hilang sendiri); tadi ada yang ditanyakan →
   * Ubah | Selesai, "Makasih udah dilengkapi!", lalu tutup sendiri.
   */
  async function sesudahSimpan(i: number, tx: Transaction) {
    const ditanya = dariDaftar || Boolean(perintah.draft) || pesan.some((x) => x.t === "tanya");
    setPesan((prev) => prev.map((x, j) => (j === i && x.t === "periksa" ? { ...x, selesai: true } : x)));
    setAktif(null);
    router.refresh();
    if (!ditanya) {
      tambah({ t: "kartu", tx, perbaikan: false });
      if (!besar) setRingkas({ tx });
      return;
    }
    const { count } = await db.from("draft_catat").select("transaksi_id", { count: "exact", head: true });
    tambah({ t: "kartu", tx, perbaikan: true });
    if (kantongSesi.current.length) return mulaiSaldo(count ?? 0);
    tambah({ t: "tutup", lagi: count ?? 0 });
    setDetik(TUTUP_DETIK);
  }

  /** Kartu periksa → Ubah: form dengan isian terbaca; menyimpan form = Simpan. */
  async function ubahPeriksa(i: number, tx: Transaction) {
    if (sibuk) return;
    const { data } = await db.from("transactions").select("id, amount").eq("induk_id", tx.id).limit(1).maybeSingle();
    setUbah({ tx, ikutan: data ? { id: data.id as string, amount: Number(data.amount) } : null, i });
  }

  /** Kartu periksa → Buang: draft dihapus, bisa diurungkan. */
  async function buangPeriksa(i: number) {
    const p = pesan[i];
    if (p?.t !== "periksa" || p.selesai || sibuk) return;
    setSibuk(true);
    const salinan = await buangDraft(db, p.tx.id);
    setSibuk(false);
    if (!salinan) return tambah({ t: "app", teks: "Gagal membuang catatannya." });
    setPesan((prev) => [...prev.map((x, j) => (j === i && x.t === "periksa" ? { ...x, selesai: true } : x)), { t: "saya", teks: "Buang" }, { t: "dibuang", salinan }]);
    setAktif(null);
    router.refresh();
  }

  async function urungkanDibuang(i: number) {
    const p = pesan[i];
    if (p?.t !== "dibuang" || p.diurungkan || sibuk) return;
    setSibuk(true);
    const galat = await urungkanBuang(db, p.salinan);
    setSibuk(false);
    if (galat) return tambah({ t: "app", teks: galat });
    setPesan((prev) => prev.map((x, j) => (j === i && x.t === "dibuang" ? { ...x, diurungkan: true } : x)));
    router.refresh();
    const tx = p.salinan.baris[0] as unknown as Transaction;
    if (p.salinan.foto && !fotoRef.current) fotoRef.current = `/api/draft/${tx.id}/foto`;
    mulaiTanya(tx, pertanyaanDraft(tx, saldoDari) ?? "konfirmasi", 0);
  }

  /** "Saldo DANA sekarang berapa?" untuk kantong yang dibuat di obrolan ini (K1), satu per satu. */
  function mulaiSaldo(lagi: number) {
    const k = kantongSesi.current.shift();
    if (!k) {
      setTanyaSaldo(null);
      tambah({ t: "tutup", lagi });
      setDetik(TUTUP_DETIK);
      return;
    }
    setTanyaSaldo({ k, lagi });
    tambah({ t: "tanya", jenis: "saldo", teks: k.kind === "kredit" ? `Utang ${k.name} sekarang berapa?` : `Saldo ${k.name} sekarang berapa?` });
  }

  /** Jawaban saldo (K1): saldo per sekarang (saldo_sejak = sekarang); kartu/paylater = utang, disimpan minus. Kosong = dilewati. */
  async function simpanSaldo(isi: string | null) {
    if (!tanyaSaldo || sibuk) return;
    const { k, lagi } = tanyaSaldo;
    const n = isi === null ? null : bacaNominal(isi) ?? (/^0+$/.test(isi.replace(/\D/g, "")) ? 0 : null);
    if (isi !== null && n === null) return tambah({ t: "app", teks: "Angkanya belum kebaca. Coba ketik lagi, mis. 250.000" });
    setPesan((prev) => prev.map((p) => (p.t === "tanya" ? { ...p, selesai: true } : p)));
    tambah({ t: "saya", teks: n === null ? "Lewati" : `Rp ${angkaRibuan(String(n))}` });
    if (n !== null) {
      setSibuk(true);
      const { error } = await db
        .from("user_accounts")
        .update({ saldo_awal: k.kind === "kredit" ? -Math.abs(n) : n, saldo_sejak: new Date().toISOString() })
        .eq("id", k.id);
      setSibuk(false);
      if (error) {
        setPesan((prev) => {
          const j = prev.findLastIndex((p) => p.t === "tanya");
          return prev.map((p, x) => (x === j && p.t === "tanya" ? { ...p, selesai: false } : p));
        });
        return tambah({ t: "app", teks: "Gagal menyimpan saldonya. Coba lagi." });
      }
      router.refresh();
    }
    mulaiSaldo(lagi);
  }

  // Kartu hasil di lembar ringkas hilang sendiri; saran muncul lagi dan
  // ketikan berikutnya jadi catatan baru (bukan koreksi kartu yang sudah
  // tidak terlihat). Batalkan memulai ulang hitungannya.
  useEffect(() => {
    // Sedang menulis cerita untuk kartu itu: jangan dihilangkan dulu.
    if (!ringkas || besar || cerita) return;
    const t = setTimeout(() => {
      setRingkas(null);
      setPesan([]);
    }, KARTU_RINGKAS_MS);
    return () => clearTimeout(t);
  }, [ringkas, besar, cerita]);

  // Hitung mundur penutup.
  useEffect(() => {
    if (detik === null) return;
    if (detik <= 0) return selesaiTutup();
    const t = setTimeout(() => setDetik((d) => (d === null ? null : d - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detik]);

  function selesaiTutup() {
    setDetik(null);
    const lagi = [...pesan].reverse().find((p) => p.t === "tutup");
    if (lagi?.t === "tutup" && lagi.lagi > 0) {
      sesiBaru();
      setLayar("daftar");
      setDariDaftar(false);
      void muatDaftar();
    } else onClose();
  }

  const bukaDraft = useCallback(
    async (id: string, dariList: boolean) => {
      sesiBaru();
      setBesar(true);
      setLayar("obrolan");
      setDariDaftar(dariList);
      setSibuk(true);
      const [{ data: tx }, { data: meta }] = await Promise.all([
        db.from("transactions").select("*").eq("id", id).maybeSingle(),
        db.from("draft_catat").select("ada_foto").eq("transaksi_id", id).maybeSingle(),
      ]);
      setSibuk(false);
      const t = tx as Transaction | null;
      if (!t || t.status !== "needs_review") {
        tambah({ t: "app", teks: "Catatan ini sudah selesai atau sudah dihapus." });
        return;
      }
      // Dibangun ulang dari draftnya: asli → yang sudah kebaca → pertanyaan (atau kartu periksa).
      fotoRef.current = meta?.ada_foto ? `/api/draft/${id}/foto` : null;
      tambah(
        meta?.ada_foto
          ? { t: "foto", src: `/api/draft/${id}/foto` }
          : { t: "saya", teks: t.source === "text" && t.raw_ocr_text ? t.raw_ocr_text : "📷 Struk" },
      );
      const jenis = pertanyaanDraft(t, saldoDari) ?? "konfirmasi";
      if (jenis === "konfirmasi") return mulaiTanya(t, jenis, 0);
      const tujuan = kantong.find((k) => k.id === t.kantong_tujuan_id)?.name;
      const kebaca = [
        t.merchant,
        t.category !== "other" ? namaKategori(kategori, t.category, t.type) : null,
        Number(t.amount) > 0 ? fmtIDR(Number(t.amount)) : null,
        t.paylater ?? (t.kantong_id ? t.payment_method : null),
        tujuan ? `ke ${tujuan}` : null,
      ].filter(Boolean);
      tambah(kebaca.length ? { t: "app", teks: "Yang sudah kebaca:", sub: kebaca.join(" · ") } : { t: "app", teks: "Belum ada yang kebaca." });
      mulaiTanya(t, jenis, 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, kantong, kategori],
  );

  // Dibuka langsung ke daftar atau ke satu catatan (kartu Beranda, push).
  // Sekali saja: efek berjalan dua kali di mode dev (StrictMode).
  const sudahDibuka = useRef(false);
  useEffect(() => {
    if (sudahDibuka.current) return;
    sudahDibuka.current = true;
    // Membuka draft/daftar sekali saat dipasang — aksi pengguna yang tertunda, bukan state turunan.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (perintah.draft) void bukaDraft(perintah.draft, false);
    else if (perintah.layar === "daftar") void muatDaftar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // <dialog> bawaan: fokus terkunci, Kembali/Esc memicu "cancel".
  const kembaliRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    d.showModal();
    // Fokus awal: kolom ketik (ringkas, keyboard langsung siap) atau judul
    // (besar) — bukan pegangan, yang lalu tampil bercincin fokus.
    if (perintah.besar) judulRef.current?.focus();
    else inputRef.current?.focus();
    const batal = (e: Event) => {
      e.preventDefault();
      kembaliRef.current();
    };
    d.addEventListener("cancel", batal);
    // Tombol kembali browser/HP: satu langkah "kembali" lembar ini dulu (SPEC-perbaikan-uiux #12).
    const lepas = daftarLembar(() => kembaliRef.current());
    return () => {
      d.removeEventListener("cancel", batal);
      lepas();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Kembali bertingkat: obrolan → daftar/ringkas → tutup. */
  function kembali() {
    if (kamera) return setKamera(false);
    if (besar && layar === "obrolan" && dariDaftar) {
      sesiBaru();
      setLayar("daftar");
      void muatDaftar();
    } else if (besar) {
      sesiBaru();
      setBesar(false);
      setLayar("obrolan");
    } else onClose();
  }
  kembaliRef.current = kembali;

  // Tarik pegangan: ke atas = besar, ke bawah = ringkas/tutup.
  const tarikY = useRef<number | null>(null);
  const kepala = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button:not([data-pegangan])")) return;
      tarikY.current = e.clientY;
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (tarikY.current === null) return;
      const dy = e.clientY - tarikY.current;
      tarikY.current = null;
      if (dy < -40 && !besar) setBesar(true);
      else if (dy > 40) kembali();
      else if (Math.abs(dy) < 6 && (e.target as HTMLElement).closest("[data-pegangan]")) setBesar((b) => !b);
    },
  };

  function lampirkan(file: File | undefined) {
    if (!file) return;
    if (lampiran) URL.revokeObjectURL(lampiran.url);
    const url = URL.createObjectURL(file);
    urlRef.current.push(url);
    setLampiran({ file, url });
    setBesar(true);
    setLayar("obrolan");
    inputRef.current?.focus();
  }

  // Pertanyaan yang masih terbuka menentukan jenis kolom ketik.
  const tanyaTerbuka = pesan.findLast((p): p is Extract<Pesan, { t: "tanya" }> => p.t === "tanya" && !p.selesai);
  // Kartu periksa yang masih terbuka: ketikan = koreksi (pola `cerita`), bukan transaksi baru.
  const iPeriksa = pesan.findLastIndex((p) => p.t === "periksa" && !p.selesai);
  const tanyaBuka = aktif && tanyaTerbuka ? aktif.jenis : aktif && iPeriksa >= 0 ? "konfirmasi" : null;
  const saldoBuka = Boolean(tanyaSaldo && tanyaTerbuka?.jenis === "saldo");
  const modeNominal = (tanyaBuka === "nominal" || saldoBuka) && !lampiran;

  function kirim(e?: FormEvent) {
    e?.preventDefault();
    const isi = teks.trim();
    if (sibuk || (!isi && !lampiran)) return;
    if (isi.length > TEKS_MAKS) return tambah({ t: "app", teks: `Maksimal ${TEKS_MAKS} karakter.` });
    setTeks("");
    if (cerita && !lampiran) return void simpanCerita(cerita, isi);
    // Saldo kantong yang baru dibuat (K1).
    if (saldoBuka && !lampiran) return void simpanSaldo(isi);
    // "Kantong 'GoPay' belum ada. Buat sekarang?" dijawab ketik "ya"/"buat".
    if (tanyaTerbuka?.jenis === "buat" && tanyaTerbuka.buat && /^(ya|iya|buat|bikin|oke|ok|boleh)\b/i.test(isi)) {
      return void jawab(`buat:${tanyaTerbuka.buat}`, isi, tanyaTerbuka.untuk);
    }
    if (lampiran) {
      const l = lampiran;
      setLampiran(null);
      return void catatFoto(l.file, l.url, isi);
    }
    // "hapus aja" / "ga jadi": catatan yang sedang ditanyakan dibuang.
    if (tanyaBuka && aktif && mauHapus(isi)) return void hapusDraft(aktif.tx, isi);
    // Ditanya "Catat lagi?" lalu dijawab "bukan"/"nggak": draft-nya dibuang.
    if (tanyaBuka === "duplikat" && aktif && /^(bukan|tidak|ga|gak|nggak|enggak|no|jangan)\b/i.test(isi)) {
      return void hapusDraft(aktif.tx, isi, "Oke, tidak dicatat.");
    }
    // Ketikan saat ada pertanyaan = jawabannya. Saat konfirmasi, ketikan
    // dianggap koreksi yang dibaca ulang.
    if (tanyaBuka) return void jawab(isi, undefined, tanyaBuka === "konfirmasi" ? "cerita" : undefined);
    // Setelah transaksi tersimpan, "eh yang tadi pakai BCA" = koreksi untuknya.
    const terakhir = [...pesan].reverse().find((p) => p.t === "kartu");
    if (terakhir?.t === "kartu" && !terakhir.batal && mauHapus(isi)) {
      setBesar(true);
      setLayar("obrolan");
      setRingkas(null);
      tambah({ t: "saya", teks: isi });
      return void batalkan(terakhir.tx).then(() => tambah({ t: "app", teks: "Oke, sudah dihapus." }));
    }
    if (terakhir?.t === "kartu" && !terakhir.batal && apakahKoreksi(isi)) return void koreksi(terakhir.tx, isi);
    void catatTeks(isi);
  }

  /** Cerita di balik transaksi yang barusan tersimpan → keterangannya (SPEC-cerita-tanya). */
  async function simpanCerita(tx: Transaction, isi: string) {
    setSibuk(true);
    const { data } = await db.from("transactions").update({ description: isi.slice(0, 500) }).eq("id", tx.id).select().single();
    setSibuk(false);
    setCerita(null);
    if (!data) return tambah({ t: "app", teks: "Gagal menyimpan ceritanya." });
    const baru = data as Transaction;
    // Di lembar ringkas, pesan "app" terakhir tampil sebagai galat: cukup
    // kartunya yang kini memuat ceritanya.
    setPesan((prev) => [
      ...prev.map((p) => (p.t === "kartu" && p.tx.id === tx.id ? { ...p, tx: baru } : p)),
      ...(besar ? [{ t: "app" as const, teks: "Cerita tersimpan." }] : []),
    ]);
    setRingkas((r) => (r && r.tx.id === tx.id ? { ...r, tx: baru } : r));
    router.refresh();
  }

  /** Koreksi lewat ketikan untuk transaksi yang barusan tersimpan (Fase B). */
  async function koreksi(tx: Transaction, isi: string) {
    setBesar(true);
    setLayar("obrolan");
    setRingkas(null);
    tambah({ t: "saya", teks: isi }, { t: "status", teks: "Mengoreksi…" });
    setSibuk(true);
    const r = await kirimJson(`/api/transaksi/${tx.id}/koreksi`, { teks: isi });
    setPesan((prev) => prev.filter((p) => p.t !== "status"));
    setSibuk(false);
    const baru = r.data.transaction as Transaction | undefined;
    if (!baru) return tambah({ t: "app", teks: (r.data.error as string) ?? "Gagal mengoreksi." });
    setPesan((prev) => [
      ...prev.map((p) => (p.t === "kartu" && p.tx.id === tx.id ? { ...p, tx: baru } : p)),
      { t: "koreksi", id: tx.id, perubahan: r.data.perubahan as string[], sebelum: r.data.sebelum as Partial<Transaction> },
    ]);
    router.refresh();
    // "bukan, itu laundry": tawarkan ikut membetulkan transaksi lain dari merchant yang sama (SPEC-ingat-kategori).
    const merchant = baru.merchant?.trim();
    if (merchant && baru.category !== tx.category && (baru.type === "expense" || baru.type === "income")) {
      const nama = kategori.find((k) => k.type === baru.type && k.slug === baru.category)?.name ?? baru.category;
      void serupa.tawarkan({ merchant, type: baru.type, kategori: { slug: baru.category, name: nama }, kelompok: baru.kelompok ?? null, kecuali: baru.id });
    }
  }

  async function batalkanKoreksi(i: number) {
    const p = pesan[i];
    if (p?.t !== "koreksi" || sibuk) return;
    setSibuk(true);
    // maybeSingle: transaksi yang sudah dihapus = 0 baris, bukan galat 406.
    const { data, error } = await db.from("transactions").update(p.sebelum).eq("id", p.id).select().maybeSingle();
    // Biaya admin / cashback ikut kembali ke kantong semula.
    if (data && "kantong_id" in p.sebelum) {
      await db.from("transactions").update({ kantong_id: p.sebelum.kantong_id, payment_method: p.sebelum.payment_method }).eq("induk_id", p.id);
    }
    setSibuk(false);
    if (!data) {
      if (error) return tambah({ t: "app", teks: "Gagal membatalkan perubahannya." });
      setPesan((prev) => prev.map((x, j) => (j === i && x.t === "koreksi" ? { ...x, dihapus: true } : x)));
      return tambah({ t: "app", teks: "Transaksinya sudah dihapus." });
    }
    setPesan((prev) =>
      prev.map((x, j) =>
        j === i && x.t === "koreksi" ? { ...x, dibatalkan: true } : x.t === "kartu" && x.tx.id === p.id ? { ...x, tx: data as Transaction } : x,
      ),
    );
    router.refresh();
  }

  function keDetail(tx: Transaction) {
    onClose();
    router.push(alamatDetail(tx.id, pathname));
  }

  /** Belanja paylater jadi rencana cicilan (SPEC-paylater): kartu, lalu tutup sendiri. */
  async function cicilanDibuat(c: Cicilan) {
    setAktif(null);
    setBesar(true);
    setLayar("obrolan");
    setRingkas(null);
    const { count } = await db.from("draft_catat").select("transaksi_id", { count: "exact", head: true });
    tambah(
      { t: "cicilan", c },
      { t: "tutup", lagi: count ?? 0, teks: "Sip, dicatat sebagai cicilan. Belanjanya belum jadi pengeluaran — tiap cicilan dicatat saat dibayar." },
    );
    setDetik(TUTUP_DETIK);
    router.refresh();
  }

  async function hapusDraft(tx: Transaction, isi: string, penutup = "Oke, catatannya dihapus. 🗑️") {
    setPesan((prev) => prev.map((p) => (p.t === "tanya" ? { ...p, selesai: true } : p)));
    tambah({ t: "saya", teks: isi });
    setSibuk(true);
    const { error } = await db.from("transactions").delete().eq("id", tx.id);
    setSibuk(false);
    if (error) return tambah({ t: "app", teks: "Gagal menghapus catatannya." });
    setAktif(null);
    const { count } = await db.from("draft_catat").select("transaksi_id", { count: "exact", head: true });
    tambah({ t: "tutup", lagi: count ?? 0, teks: penutup });
    setDetik(TUTUP_DETIK);
    router.refresh();
  }

  async function batalkan(tx: Transaction) {
    await db.from("transactions").delete().eq("id", tx.id);
    setPesan((prev) => prev.map((p) => (p.t === "kartu" && p.tx.id === tx.id ? { ...p, batal: true } : p)));
    setRingkas((r) => (r && r.tx.id === tx.id ? { ...r, batal: true } : r));
    router.refresh();
  }

  // Deposito tidak pernah jadi jawaban "kantong mana?" (SPEC-simpanan).
  const pilihanKantong = (jenis: JenisTanya) =>
    kantong.filter(
      (k) =>
        !kantongDeposito(k) &&
        (jenis === "kantong_tujuan" ? k.id !== aktif?.tx.kantong_id : aktif?.tx.type === "transfer" || k.kind !== "orang"),
    );

  /** `hilang`: kartu di lembar ringkas — bilah sisa waktu sebelum hilang sendiri. */
  function kartu(tx: Transaction, perbaikan: boolean, batal?: boolean, key?: number, hilang?: boolean) {
    const { ikon: Ikon, warna } = tandaTransaksi(tx, kategori);
    const nama = namaKategori(kategori, tx.category, tx.type);
    const tanda = tx.type === "expense" ? "−" : tx.type === "income" ? "+" : "";
    const usulan = !batal && !perbaikan ? bacaUsulan(tx) : null;
    return (
      <div key={key} className={`${s.kartuHasil} ${batal ? s.kartuBatal : ""}`}>
        <div className={s.tersimpan}>{batal ? "Dibatalkan" : <><Check size={14} /> Tersimpan</>}</div>
        <div className={s.baris}>
          <span className={s.barisIkon} style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
            <Ikon size={20} />
          </span>
          <span className={s.barisTeks}>
            <span className={s.barisJudul}>{tx.merchant ?? nama}</span>
            <span className={s.redup}>
              {tx.type === "transfer" ? "Pindah kantong" : nama} · {tx.payment_method ?? "—"} · {fmtTanggalPendek(tx.transaction_date)}
            </span>
            {tx.description && <span className={s.redup}>“{tx.description}”</span>}
          </span>
          <span className={s.nominal}>
            {tanda}
            {fmtIDR(Number(tx.amount))}
          </span>
        </div>
        {usulan && <p className={s.redup} style={{ margin: "8px 0 0" }}>Isinya campur: {ringkasUsulan(usulan, kategori)}</p>}
        {!batal && (
          <div className={s.aksiKartu}>
            {perbaikan ? (
              <>
                <button type="button" className={s.flat} onClick={() => keDetail(tx)}>Ubah</button>
                <button type="button" className={s.flat} onClick={selesaiTutup}>Selesai</button>
              </>
            ) : (
              <>
                <button type="button" className={s.flat} onClick={() => void batalkan(tx)}>Batalkan</button>
                {usulan && <button type="button" className={s.flat} onClick={() => setPecah(tx)}>Pecah</button>}
                <button type="button" className={s.flat} onClick={() => keDetail(tx)}>Ubah</button>
                {/* Cerita di baliknya, untuk Tanya AI nanti — tidak memaksa. */}
                {!tx.description && (
                  <button
                    type="button"
                    className={s.flat}
                    aria-pressed={cerita?.id === tx.id}
                    onClick={() => {
                      setCerita((c) => (c?.id === tx.id ? null : tx));
                      inputRef.current?.focus();
                    }}
                  >
                    {cerita?.id === tx.id ? "Batal cerita" : "+ Tambah cerita"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {hilang && (
          // key berganti saat dibatalkan → bilahnya penuh lagi, sama dengan hitungannya.
          <span
            key={String(batal)}
            className={s.sisaWaktu}
            style={{ animationDuration: `${KARTU_RINGKAS_MS}ms` }}
            role="timer"
            aria-label={`Hilang dalam ${KARTU_RINGKAS_MS / 1000} detik`}
          />
        )}
      </div>
    );
  }

  function kartuPeriksa(p: Extract<Pesan, { t: "periksa" }>, i: number) {
    return (
      <KartuPeriksa
        key={`periksa-${i}`}
        tx={p.tx}
        foto={p.foto}
        kategori={kategori}
        kantong={kantong}
        sibuk={sibuk}
        menyimpan={menyimpan}
        fokus={i === iPeriksa}
        onSimpan={() => void simpanPeriksa(i)}
        onUbah={() => void ubahPeriksa(i, p.tx)}
        onBuang={() => void buangPeriksa(i)}
      />
    );
  }

  function isiPesan(p: Pesan, i: number) {
    switch (p.t) {
      case "saya":
        return <div key={i} className={`${s.bub} ${s.bubSaya}`}>{p.teks}</div>;
      case "foto":
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={i} src={p.src} alt="Foto struk" className={s.fotoSaya} />;
      case "app":
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            {p.teks}
            {p.sub && <small>{p.sub}</small>}
          </div>
        );
      case "status":
        return (
          <div key={i} className={s.statusObrolan} role="status">
            <Spinner /> {p.teks}
          </div>
        );
      case "kartu":
        return kartu(p.tx, p.perbaikan, p.batal, i);
      case "periksa":
        return p.selesai ? null : kartuPeriksa(p, i);
      case "dibuang":
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            {p.diurungkan ? "Catatannya dikembalikan." : "Catatannya dibuang."}
            {!p.diurungkan && (
              <div className={s.pilihanJawab}>
                <button type="button" disabled={sibuk} onClick={() => void urungkanDibuang(i)}>
                  ↩ Urungkan
                </button>
              </div>
            )}
          </div>
        );
      case "koreksi": {
        // Transaksinya sudah dibatalkan (dihapus) dari kartunya → tidak ada lagi yang bisa dikembalikan.
        const txBatal = p.dihapus || pesan.some((x) => x.t === "kartu" && x.tx.id === p.id && x.batal);
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            {p.dibatalkan ? "Perubahannya dibatalkan." : "Sudah diubah:"}
            {!p.dibatalkan && p.perubahan.map((x) => <small key={x}>{x}</small>)}
            {!p.dibatalkan && !txBatal && (
              <div className={s.pilihanJawab}>
                <button type="button" disabled={sibuk} onClick={() => void batalkanKoreksi(i)}>
                  ↩ Batalkan perubahan
                </button>
              </div>
            )}
          </div>
        );
      }
      case "lengkapi": {
        const buka = !p.selesai && !sibuk;
        return (
          <div key={i} className={s.kartuHasil}>
            <div className={`${s.tersimpan} ${s.tanyaKartu}`}>Lengkapi transaksi ini?</div>
            {p.u.kandidat.length === 1 ? (
              <p style={{ margin: "4px 0" }}>{p.u.kandidat[0].label}</p>
            ) : (
              <div role="radiogroup" aria-label="Transaksi yang dilengkapi" style={{ margin: "4px 0" }}>
                <p className={s.redup} style={{ margin: "0 0 4px" }}>Ada {p.u.kandidat.length} transaksi yang cocok. Yang mana?</p>
                {p.u.kandidat.map((k) => (
                  <BarisPilih key={k.id} peran="radio" dipilih={p.pilih === k.id} onClick={() => buka && ubahPesan(i, { pilih: k.id })}>
                    <span className={s.barisTeks}>
                      <span style={{ whiteSpace: "normal" }}>{k.label}</span>
                    </span>
                  </BarisPilih>
                ))}
              </div>
            )}
            {p.u.perubahan.length > 0 && (
              <ul className={s.redup} style={{ margin: "4px 0", paddingLeft: 18 }}>
                {p.u.perubahan.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <p className={s.redup} style={{ margin: "4px 0" }}>Nominal, tanggal, dan kantongnya tetap.</p>
            {p.u.tawarKategori && (
              <div>
                <BarisPilih peran="checkbox" dipilih={p.ganti} onClick={() => buka && ubahPesan(i, { ganti: !p.ganti })}>
                  <span className={s.barisTeks}>Ganti kategori ke {p.u.tawarKategori.nama}</span>
                </BarisPilih>
              </div>
            )}
            {p.u.cashback?.buat && (
              <div>
                <BarisPilih peran="checkbox" dipilih={p.buat} onClick={() => buka && ubahPesan(i, { buat: !p.buat })}>
                  <span className={s.barisTeks}>
                    <span style={{ whiteSpace: "normal" }}>
                      Buat kantong {p.u.cashback.kantong} untuk cashback {fmtIDR(p.u.cashback.nominal)}
                    </span>
                  </span>
                </BarisPilih>
              </div>
            )}
            {p.memproses && (
              <div className={s.statusObrolan} role="status">
                <Spinner /> Melengkapi…
              </div>
            )}
            {buka && (
              // Hierarki: Lengkapi utama, Catat sebagai baru sekunder, Batal netral (SPEC-perbaikan-uiux #9).
              <div className={s.aksiKartu}>
                <button type="button" className={`${s.tombol} ${s.tombolPenuh}`} onClick={() => void lengkapiDariKartu(i)}>
                  Lengkapi
                </button>
                <button
                  type="button"
                  className={`${s.flat} ${s.flatNetral}`}
                  style={{ fontSize: "inherit" }}
                  onClick={() => {
                    ubahPesan(i, { selesai: true });
                    tambah({ t: "saya", teks: "Batal" }, { t: "app", teks: "Oke, tidak dicatat." });
                  }}
                >
                  Batal
                </button>
                <button type="button" className={s.flat} onClick={() => void catatSebagaiBaru(i)}>
                  Catat sebagai baru
                </button>
              </div>
            )}
          </div>
        );
      }
      case "pindahBukti": {
        const buka = !p.selesai && !sibuk;
        return (
          <div key={i} className={s.kartuHasil}>
            <div className={`${s.tersimpan} ${s.tanyaKartu}`}>Jadikan pindah kantong?</div>
            <p style={{ margin: "4px 0" }}>{p.u.label}</p>
            <p className={s.redup} style={{ margin: "4px 0" }}>
              Sepertinya ini pindah {p.u.arah} yang sudah tercatat dari rekening koran. Transaksi itu diubah jadi pindah kantong — tidak dicatat dua kali.
            </p>
            {p.memproses && (
              <div className={s.statusObrolan} role="status">
                <Spinner /> Mengubah…
              </div>
            )}
            {buka && (
              <div className={s.aksiKartu}>
                <button type="button" className={`${s.tombol} ${s.tombolPenuh}`} onClick={() => void jadikanPindahBukti(i)}>
                  Jadikan pindah {p.u.arah}
                </button>
                <button
                  type="button"
                  className={`${s.flat} ${s.flatNetral}`}
                  style={{ fontSize: "inherit" }}
                  onClick={() => {
                    ubahPindah(i, { selesai: true });
                    tambah({ t: "saya", teks: "Batal" }, { t: "app", teks: "Oke, tidak dicatat." });
                  }}
                >
                  Batal
                </button>
                <button type="button" className={s.flat} onClick={() => void catatSebagaiBaru(i)}>
                  Catat sebagai baru
                </button>
              </div>
            )}
          </div>
        );
      }
      case "dipindah":
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            {p.diurungkan ? "Pindah kantongnya diurungkan." : `Sudah jadi pindah kantong ${p.arah}.`}
            {!p.diurungkan && (
              <div className={s.pilihanJawab}>
                <button type="button" disabled={sibuk} onClick={() => void urungkanDipindah(i)}>
                  ↩ Urungkan
                </button>
              </div>
            )}
          </div>
        );
      case "dilengkapi":
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            {p.diurungkan ? "Pelengkapannya diurungkan." : "Sudah dilengkapi:"}
            {!p.diurungkan && (p.r.perubahan.length ? p.r.perubahan : ["Tanda “Perlu dilengkapi” dilepas"]).map((x) => <small key={x}>{x}</small>)}
            {!p.diurungkan && p.r.cashback_tertunda && (
              <small>Cashback {fmtIDR(p.r.cashback_tertunda.nominal)} belum dicatat: belum ada kantong {p.r.cashback_tertunda.dompet}.</small>
            )}
            {!p.diurungkan && (
              <div className={s.pilihanJawab}>
                <button type="button" disabled={sibuk} onClick={() => void urungkanLengkapi(i)}>
                  ↩ Urungkan
                </button>
                <button type="button" disabled={sibuk} onClick={() => keDetail(p.r.transaction)}>
                  Lihat
                </button>
              </div>
            )}
          </div>
        );
      case "cicilan":
        return (
          <div key={i} className={s.kartuHasil}>
            <div className={s.tersimpan}>
              <Check size={14} /> Cicilan dibuat
            </div>
            <div className={s.baris}>
              <span className={s.barisIkon} aria-hidden>
                <CalendarClock size={20} />
              </span>
              <span className={s.barisTeks}>
                <span className={s.barisJudul}>{p.c.nama}</span>
                <span className={s.redup}>
                  {/* Tenor di sini, bukan di nominal: nominal yang lebar memotong nama & tanggalnya. */}
                  {[
                    p.c.penyedia,
                    p.c.tenor === 1
                      ? `bayar ${fmtTanggalPendek(p.c.jatuh_tempo_awal)}`
                      : `${p.c.tenor}× · mulai ${fmtTanggalPendek(p.c.jatuh_tempo_awal)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className={s.nominal}>{fmtIDR(Number(p.c.nominal))}</span>
            </div>
            <div className={s.aksiKartu}>
              <button
                type="button"
                className={s.flat}
                onClick={() => {
                  onClose();
                  router.push("/pinjaman");
                }}
              >
                Ubah
              </button>
              <button type="button" className={s.flat} onClick={selesaiTutup}>
                Selesai
              </button>
            </div>
          </div>
        );
      case "tutup":
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            {p.teks ?? "Makasih udah dilengkapi! 🙌 Transaksinya sudah tercatat. Kalau perlu diubah lagi, cek di Riwayat."}
            {/* Bilah sisa waktu yang sama dengan kartu di lembar ringkas, tanpa
                teks: habis → ke daftar (kalau masih ada) atau lembar ditutup. */}
            {detik !== null && (
              <span
                className={s.sisaWaktu}
                style={{ animationDuration: `${TUTUP_DETIK}s`, margin: "10px 0 2px" }}
                role="timer"
                aria-label={p.lagi > 0 ? `Membuka catatan berikutnya dalam ${TUTUP_DETIK} detik` : `Menutup dalam ${TUTUP_DETIK} detik`}
              />
            )}
          </div>
        );
      case "tanya": {
        const buka = !p.selesai && !sibuk;
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            {p.teks}
            {buka && (p.jenis === "kantong" || p.jenis === "kantong_tujuan") && (() => {
              const jenis = p.jenis;
              // "+ Buat kantong <nama>" (A-1): nama yang terbaca untuk sisi ini, bila belum ada kantongnya.
              const usul = aktif ? usulanKantongBaru(jenis, aktif.tx, kantong) : null;
              return (
                <div className={s.pilihanJawab}>
                  {pilihanKantong(jenis).map((k) => (
                    <button key={k.id} type="button" onClick={() => void jawab(k.id, k.name)}>
                      {k.emoji ? `${k.emoji} ` : ""}
                      {k.name}
                    </button>
                  ))}
                  {usul && (
                    <button type="button" onClick={() => void jawab(`buat:${usul}`, `+ Buat kantong ${usul}`)}>
                      + Buat kantong {usul}
                    </button>
                  )}
                </div>
              );
            })()}
            {buka && p.jenis === "buat" && p.buat && aktif && (
              <div className={s.pilihanJawab}>
                <button type="button" onClick={() => void jawab(`buat:${p.buat}`, `Buat kantong ${p.buat}`, p.untuk)}>
                  Buat kantong {p.buat}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPesan((prev) => prev.map((x) => (x.t === "tanya" ? { ...x, selesai: true } : x)));
                    tambah({ t: "saya", teks: "Pilih yang ada" });
                    mulaiTanya(aktif.tx, p.untuk ?? aktif.jenis, aktif.ronde);
                  }}
                >
                  Pilih yang ada
                </button>
              </div>
            )}
            {buka && p.jenis === "sendiri" && aktif && (() => {
              const lembaga = bacaPetunjuk(aktif.tx.bukti_transfer).lembaga ?? "rekening itu";
              return (
                <div className={s.pilihanJawab}>
                  <button type="button" onClick={() => void jawab("ya", `Ya, pindah dari ${lembaga}`)}>Ya, pindah dari {lembaga}</button>
                  <button type="button" onClick={() => void jawab("bukan", "Bukan, pemasukan")}>Bukan, pemasukan</button>
                </div>
              );
            })()}
            {buka && p.jenis === "cicilan" && (
              <div className={s.pilihanJawab}>
                {(p.kandidat ?? []).map((c) => (
                  <button key={c.id} type="button" onClick={() => void jawab(c.id, c.label)}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {!p.selesai && p.jenis === "saldo" && tanyaSaldo && (
              <div className={s.pilihanJawab}>
                <button type="button" disabled={sibuk} onClick={() => void simpanSaldo(null)}>
                  Lewati
                </button>
              </div>
            )}
            {buka && p.jenis === "kartu" && aktif && (
              <div className={s.pilihanJawab}>
                {kantong
                  .filter((k) => k.kind === "kredit")
                  .map((k) => (
                    <button key={k.id} type="button" onClick={() => void jawab(k.id, k.name)}>
                      {k.emoji ? `${k.emoji} ` : ""}
                      {k.name}
                    </button>
                  ))}
                <button type="button" onClick={() => void jawab("tambah", `+ Tambah ${aktif.tx.merchant}`)}>+ Tambah {aktif.tx.merchant}</button>
                <button type="button" onClick={() => void hapusDraft(aktif.tx, "Hapus catatan", "Oke, tidak dicatat.")}>Hapus catatan</button>
              </div>
            )}
            {buka && p.jenis === "duplikat" && aktif && (
              <div className={s.pilihanJawab}>
                {(p.kandidat ?? []).length === 1 && (
                  <button type="button" onClick={() => void lengkapiYangAda(p.kandidat![0].id, "Lengkapi yang sudah ada")}>Lengkapi yang sudah ada</button>
                )}
                {(p.kandidat ?? []).length > 1 &&
                  p.kandidat!.map((k) => (
                    <button key={k.id} type="button" onClick={() => void lengkapiYangAda(k.id, `Lengkapi: ${k.label}`)}>
                      Lengkapi: {k.label}
                    </button>
                  ))}
                <button type="button" onClick={() => void jawab("ya", "Ya, catat lagi")}>Ya, catat lagi</button>
                <button type="button" onClick={() => void hapusDraft(aktif.tx, "Bukan, buang", "Oke, tidak dicatat.")}>Bukan, buang</button>
              </div>
            )}
            {buka && p.jenis === "arah" && aktif && pilihanArah(aktif.tx)}
            {buka && p.jenis === "tenor" && (
              <div className={s.pilihanJawab}>
                {PILIHAN_TENOR.map((n) => (
                  <button key={n} type="button" onClick={() => void jawab(String(n), `${n}×`)}>
                    {n}×
                  </button>
                ))}
              </div>
            )}
            {buka && p.jenis === "manual" && aktif && (
              <div className={s.pilihanJawab}>
                <button type="button" onClick={() => void ubahPeriksa(-1, aktif.tx)}>📝 Isi manual</button>
              </div>
            )}
          </div>
        );
      }
    }
  }

  const judul = besar && layar === "daftar" ? "Belum selesai" : "Catat transaksi";

  return (
    <>
      <dialog
        ref={dialogRef}
        className={`${s.dialog} ${s.dialogCatat} ${besar ? s.dialogBesar : ""}`}
        aria-label={judul}
        onClick={(e) => e.target === e.currentTarget && !sibuk && onClose()}
      >
        <div className={s.kepalaCatat} {...kepala}>
          <button type="button" className={s.pegangan} data-pegangan aria-label={besar ? "Perkecil" : "Perbesar"} />
          <div className={s.judulCatat}>
            {besar && (
              <button type="button" className={s.ikonTombol} aria-label="Kembali" onClick={kembali}>
                <ChevronLeft size={26} />
              </button>
            )}
            <h2 ref={judulRef} tabIndex={-1}>{judul}</h2>
          </div>
        </div>

        <div ref={badanRef} className={s.badanCatat}>
          {!besar && (
            <>
              {jumlahDraft > 0 && (
                <button
                  type="button"
                  className={s.barisBelum}
                  onClick={() => {
                    setBesar(true);
                    setLayar("daftar");
                    void muatDaftar();
                  }}
                >
                  <ClipboardList size={20} aria-hidden />
                  <b>{jumlahDraft} belum selesai</b>
                  <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
                </button>
              )}
              {iPeriksa >= 0 && pesan[iPeriksa].t === "periksa" ? (
                // Ketikan yang lengkap: kartu periksa di lembar ringkas, Simpan terfokus (K2).
                kartuPeriksa(pesan[iPeriksa] as Extract<Pesan, { t: "periksa" }>, iPeriksa)
              ) : pesan.at(-1)?.t === "dibuang" ? (
                isiPesan(pesan.at(-1)!, pesan.length - 1)
              ) : ringkas ? (
                kartu(ringkas.tx, false, ringkas.batal, undefined, true)
              ) : (
                // Saran hanya sebelum mengetik, seperti saran pencarian One UI.
                // Ketukan mengisi kolom — tidak langsung mengirim.
                saran.length > 0 &&
                !teks && (
                  <div className={s.saran} role="group" aria-label="Transaksi terakhir">
                    {saran.map((x) => (
                      <button
                        key={x}
                        type="button"
                        className={`${s.chip} ${s.tekan}`}
                        disabled={sibuk}
                        onClick={() => {
                          setTeks(x);
                          inputRef.current?.focus();
                        }}
                      >
                        <History size={14} aria-hidden />
                        {x}
                      </button>
                    ))}
                  </div>
                )
              )}
              {sibuk && (
                <span className={s.keterangan} role="status">
                  Lagi dibaca...
                </span>
              )}
              {!sibuk && pesan.at(-1)?.t === "app" && <span className={s.galat}>{(pesan.at(-1) as { teks: string }).teks}</span>}
            </>
          )}

          {besar && layar === "obrolan" && <div className={s.obrolan}>{pesan.map(isiPesan)}</div>}

          {besar && layar === "daftar" && (
            <>
              <p className={s.redup} style={{ margin: "0 4px" }}>
                Yang belum lengkap atau belum dicek disimpan di sini sampai {UMUR_DRAFT_HARI} hari, lalu dihapus otomatis. Begitu
                disimpan, foto &amp; obrolannya pindah ke “Cara dicatat” di detail transaksinya.
              </p>
              {drafts === null ? (
                <Spinner label="Memuat…" />
              ) : drafts.length === 0 ? (
                <p className={s.redup} style={{ textAlign: "center", padding: 24 }}>
                  Semua sudah lengkap 🎉
                </p>
              ) : (
                <div className={s.blok} style={{ background: "var(--blok-2)" }}>
                  {drafts.map((d) => (
                    <button key={d.id} type="button" className={`${s.baris} ${s.tekan}`} onClick={() => void bukaDraft(d.id, true)}>
                      <span className={s.thumbDraft} aria-hidden>
                        {d.adaFoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/draft/${d.id}/foto`} alt="" />
                        ) : d.tx.source === "text" ? (
                          <ClipboardPen size={22} />
                        ) : (
                          <ReceiptText size={22} />
                        )}
                      </span>
                      <span className={s.barisTeks}>
                        <span className={s.barisJudul}>
                          {d.tx.merchant ?? (d.tx.source === "text" && d.tx.raw_ocr_text ? `“${d.tx.raw_ocr_text}”` : "Struk")}
                          {" · "}
                          {fmtTanggalPendek(d.tx.transaction_date)}
                        </span>
                        <span className={s.peringatan} style={{ fontSize: 14 }}>
                          {LABEL_KURANG[pertanyaanDraft(d.tx, saldoDari) ?? "konfirmasi"]}
                        </span>
                        <span className={s.redup} style={{ fontSize: 12 }}>
                          Dihapus otomatis {tanggalHapus(d.dibuat)}
                        </span>
                      </span>
                      <ChevronRight size={20} color="var(--teks-2)" aria-hidden />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Kolom ketik di paling bawah: paling dekat jempol & keyboard.
            Disembunyikan selama hitung mundur penutup. */}
        {detik === null && (
          <div className={s.kakiCatat}>
            {lampiran && (
              <div className={s.lampiranCatat}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lampiran.url} alt="Foto yang dilampirkan" />
                <button type="button" aria-label="Hapus foto" onClick={() => setLampiran(null)}>
                  <X size={14} />
                </button>
              </div>
            )}
            {/* Pola WhatsApp: kapsul berisi ikon + kolom ketik, tombol kirim
                bulat di luarnya. Kiri = cara lain mengisi (form Manual; saat ada
                pertanyaan, "Isi manual" untuk catatan itu); kanan = galeri &
                kamera (kamera disembunyikan saat mengetik, memberi ruang). */}
            <form onSubmit={kirim} className={s.komposer}>
              <div className={s.ketik}>
                <button
                  type="button"
                  className={s.ikonKetik}
                  aria-label={aktif ? "Isi manual catatan ini" : "Catat manual (form)"}
                  disabled={sibuk}
                  onClick={() => (aktif ? void ubahPeriksa(-1, aktif.tx) : onManual())}
                >
                  <ClipboardPen size={22} />
                </button>
              {/* textarea, bukan input: Chrome Android tidak memasang bilah isi
                  otomatis (kunci, kartu, lokasi) di atas keyboard untuknya.
                  Enter mengirim, seperti aplikasi chat; baris baru dibuang. */}
              <textarea
                ref={inputRef}
                rows={1}
                aria-label="Tulis transaksinya"
                value={teks}
                onChange={(e) => {
                  const v = e.target.value.replace(/\n/g, " ");
                  setTeks(modeNominal ? angkaRibuan(angkaMentah(v)) : v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    kirim();
                  }
                }}
                // Ctrl+V gambar (tangkapan layar, gambar yang disalin) =
                // dilampirkan seperti foto dari galeri; teks biasa tetap ditempel.
                onPaste={(e) => {
                  const gambar = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
                  if (!gambar) return;
                  e.preventDefault();
                  lampirkan(gambar);
                }}
                inputMode={modeNominal ? "numeric" : "text"}
                placeholder={
                  cerita
                    ? "Ceritain singkat, mis. “kopi sama klien”"
                    : lampiran
                    ? "Tambah keterangan…"
                    : tanyaBuka === "nominal" || saldoBuka
                      ? saldoBuka
                        ? "mis. 250.000, atau Lewati"
                        : "mis. 150.000"
                      : tanyaBuka === "kantong" || tanyaBuka === "kantong_tujuan"
                        ? "Ketik kantongnya"
                        : tanyaBuka === "kartu"
                        ? "Ketik nama kartunya"
                        : tanyaBuka === "waktu"
                          ? "mis. jam 10 atau 10.30"
                          : tanyaBuka === "tenor"
                          ? "mis. 3 kali"
                          : tanyaBuka === "duplikat"
                          ? "Ya atau bukan"
                          : tanyaBuka === "cerita"
                          ? "Ceritain di sini…"
                          : tanyaBuka === "konfirmasi" || (besar && pesan.at(-1)?.t === "kartu")
                            ? "Ketik koreksinya"
                            : "kopi 25rb gopay"
                }
                disabled={sibuk && !besar}
                enterKeyHint="send"
                autoComplete="off"
              />
                <button type="button" className={s.ikonKetik} aria-label="Pilih foto dari galeri" disabled={sibuk} onClick={() => galeriRef.current?.click()}>
                  <Paperclip size={22} />
                </button>
                {!teks && (
                  <button type="button" className={s.ikonKetik} aria-label="Foto dengan kamera" disabled={sibuk} onClick={() => setKamera(true)}>
                    <Camera size={22} />
                  </button>
                )}
              </div>
              <button type="submit" className={s.kirimBulat} aria-label="Kirim" disabled={sibuk || (!teks.trim() && !lampiran)}>
                {sibuk && !besar ? <Spinner /> : <SendHorizontal size={22} />}
              </button>
            </form>
          </div>
        )}

        <input
          ref={galeriRef}
          type="file"
          accept={`${ACCEPT_STRUK},application/pdf`}
          multiple
          hidden
          onChange={(e) => {
            // PDF rekening koran → pratinjau impor (SPEC-impor-rekening); gambar
            // pertama dilampirkan, sisanya diproses di latar seperti "Bagikan".
            const semua = [...(e.target.files ?? [])];
            const pdf = semua.filter(adalahPdf);
            const gambar = semua.filter((f) => !adalahPdf(f));
            if (pdf.length) {
              tambahRekening(pdf);
              if (!gambar.length) onClose();
            }
            // Banyak gambar: diproses di latar dengan ringkasan (SPEC-lengkapi §7).
            if (gambar.length > 1) {
              tambahStruk(gambar);
              onClose();
            } else lampirkan(gambar[0]);
            // Reset supaya memilih file yang sama dua kali tetap memicu onChange.
            e.target.value = "";
          }}
        />
      </dialog>

      {kamera && (
        <CameraCapture
          onCapture={(file) => {
            setKamera(false);
            lampirkan(file);
          }}
          onClose={() => setKamera(false)}
        />
      )}
      {pecah && (
        <PecahTransaksi
          tx={pecah}
          bagian={[]}
          usulan={bacaUsulan(pecah)}
          hanyaLembar
          onSelesai={(disimpan) => {
            // Sudah dipecah: tawarannya hilang dari kartu (usulan dikosongkan di database).
            if (disimpan) setPesan((prev) => prev.map((p) => (p.t === "kartu" && p.tx.id === pecah.id ? { ...p, tx: { ...p.tx, usulan_pecah: null } } : p)));
            setPecah(null);
          }}
        />
      )}
      {ubah && (
        <EditTransactionForm
          key={ubah.tx.id}
          tx={ubah.tx}
          ikutan={ubah.ikutan}
          terbuka
          onTutup={() => setUbah(null)}
          onTersimpan={(tx) => {
            const i = ubah.i >= 0 ? ubah.i : iPeriksa;
            setUbah(null);
            setPesan((prev) => prev.map((x) => (x.t === "tanya" ? { ...x, selesai: true } : x)));
            void sesudahSimpan(i, tx);
          }}
        />
      )}
      {serupa.elemen}
    </>
  );
}
