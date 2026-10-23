"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUp,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardPen,
  History,
  Image as IkonGambar,
  Paperclip,
  ReceiptText,
  X,
} from "lucide-react";
import CameraCapture from "@/components/CameraCapture";
import { tandaTransaksi } from "@/components/kategori";
import { Spinner } from "@/components/oneui";
import s from "@/components/ui.module.css";
import { useCatat } from "@/components/Catat";
import { ACCEPT_STRUK } from "@/components/UploadReceiptForm";
import { apakahKoreksi, CERITA_ULANG, KALIMAT_TANYA, MAKS_CERITA, pertanyaanDraft, type JenisTanya } from "@/lib/draft";
import { alamatDetail, angkaMentah, angkaRibuan, fmtIDR, fmtTanggalPendek } from "@/lib/format";
import { namaKategori } from "@/lib/kategori";
import { UMUR_DRAFT_HARI } from "@/lib/notifikasi";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TEKS_MAKS } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Catat sebagai obrolan (SPEC-catat-chat.md): lembar yang bisa membesar.
 * Ringkas = pintasan + kolom ketik seperti dulu; besar = obrolan satu
 * transaksi, atau daftar catatan yang belum selesai.
 *
 * Satu gambar/teks = satu transaksi = satu sesi. Yang langsung lengkap
 * tersimpan dengan kartu Batalkan | Ubah. Yang kurang ditanya di tempat;
 * begitu terjawab, kartu Ubah | Selesai lalu lembar menutup sendiri —
 * sama dari mana pun datangnya (ketik, kamera, galeri, bagikan, daftar).
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
  | { t: "tanya"; jenis: JenisTanya | "manual"; teks: string; selesai?: boolean }
  | { t: "kartu"; tx: Transaction; perbaikan: boolean; batal?: boolean }
  | { t: "koreksi"; id: string; perubahan: string[]; sebelum: Partial<Transaction>; dibatalkan?: boolean }
  | { t: "tutup"; lagi: number };

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

/** Cara lembar dibuka. Ganti `id` = lembar baru (sesi bersih). */
export interface PerintahCatat {
  id: number;
  besar: boolean;
  layar: "obrolan" | "daftar";
  teks?: string;
  draft?: string;
}

const KURANG: Record<JenisTanya, string> = {
  cerita: "Belum kebaca sama sekali",
  nominal: "Nominal belum kebaca",
  kantong: "Kantong belum jelas",
  kantong_tujuan: "Kantong tujuan belum jelas",
  konfirmasi: "Tinggal dicek",
};

const tanggalHapus = (dibuat: string) => {
  const d = new Date(dibuat);
  d.setDate(d.getDate() + UMUR_DRAFT_HARI);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};

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
  const { kantong, kategori } = useCatat();
  const db = useMemo(() => createSupabaseBrowserClient(), []);

  const [besar, setBesar] = useState(perintah.besar);
  const [layar, setLayar] = useState(perintah.layar);
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [aktif, setAktif] = useState<Aktif | null>(null);
  const [teks, setTeks] = useState(perintah.teks ?? "");
  const [lampiran, setLampiran] = useState<{ file: File; url: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [ringkas, setRingkas] = useState<{ tx: Transaction; batal?: boolean } | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [detik, setDetik] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [kamera, setKamera] = useState(false);
  const [dariDaftar, setDariDaftar] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const badanRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const judulRef = useRef<HTMLHeadingElement>(null);
  const galeriRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string[]>([]);

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

  /** Ajukan pertanyaan untuk draft yang sedang dibahas. */
  function mulaiTanya(tx: Transaction, jenis: JenisTanya, ronde: number) {
    setAktif({ tx, jenis, ronde });
    if (jenis === "cerita" && ronde >= MAKS_CERITA) {
      tambah({ t: "tanya", jenis: "manual", teks: "Masih belum kebaca nih. Isi manual aja?" });
    } else {
      tambah({ t: "tanya", jenis, teks: jenis === "cerita" && ronde > 0 ? CERITA_ULANG : KALIMAT_TANYA[jenis] });
    }
  }

  /** Hasil catatan baru (teks/foto): lengkap → kartu; kurang → percakapan. */
  function terimaHasil(data: Record<string, unknown>, status: number) {
    const tx = data.transaction as Transaction | undefined;
    if (!tx) {
      tambah({ t: "app", teks: (data.error as string) ?? "Gagal nyimpen. Coba lagi ya." });
      return;
    }
    const jenis = data.pertanyaan as JenisTanya | null;
    router.refresh();
    if (!jenis && status < 300) {
      tambah({ t: "kartu", tx, perbaikan: false });
      if (!besar) setRingkas({ tx });
      return;
    }
    setBesar(true);
    setLayar("obrolan");
    mulaiTanya(tx, jenis ?? "konfirmasi", 0);
  }

  async function catatTeks(isi: string) {
    sesiBaru();
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
    terimaHasil(data, status);
  }

  async function jawab(nilai: string, label?: string, jenisPaksa?: JenisTanya) {
    if (!aktif || sibuk) return;
    const jenis = jenisPaksa ?? aktif.jenis;
    setPesan((prev) => prev.map((p) => (p.t === "tanya" ? { ...p, selesai: true } : p)));
    tambah({ t: "saya", teks: label ?? (jenis === "nominal" ? `Rp ${angkaRibuan(angkaMentah(nilai))}` : nilai) });
    setSibuk(true);
    if (jenis === "cerita") tambah({ t: "status", teks: "Membaca ulang…" });
    const r = await kirimJson(`/api/draft/${aktif.tx.id}/jawab`, { jenis, nilai });
    setPesan((prev) => prev.filter((p) => p.t !== "status"));
    setSibuk(false);

    if (r.status === 422) {
      // Jawaban tidak bisa dipakai: dibalas, pertanyaannya dibuka lagi.
      tambah({ t: "app", teks: r.data.error as string });
      setPesan((prev) => {
        const i = prev.findLastIndex((p) => p.t === "tanya");
        return prev.map((p, j) => (j === i && p.t === "tanya" ? { ...p, selesai: false } : p));
      });
      return;
    }
    const tx = r.data.transaction as Transaction | undefined;
    if (!tx) {
      setAktif(null);
      tambah({ t: "app", teks: (r.data.error as string) ?? "Gagal nyimpen jawabannya." });
      return;
    }
    const lanjut = r.data.pertanyaan as JenisTanya | null;
    if (lanjut) return mulaiTanya(tx, lanjut, jenis === "cerita" ? aktif.ronde + 1 : aktif.ronde);

    // Selesai dilengkapi: kartu Ubah | Selesai, lalu tutup sendiri.
    setAktif(null);
    const { count } = await db.from("draft_catat").select("transaksi_id", { count: "exact", head: true });
    tambah({ t: "kartu", tx, perbaikan: true }, { t: "tutup", lagi: count ?? 0 });
    setDetik(TUTUP_DETIK);
    router.refresh();
  }

  // Kartu hasil di lembar ringkas hilang sendiri; saran muncul lagi dan
  // ketikan berikutnya jadi catatan baru (bukan koreksi kartu yang sudah
  // tidak terlihat). Batalkan memulai ulang hitungannya.
  useEffect(() => {
    if (!ringkas || besar) return;
    const t = setTimeout(() => {
      setRingkas(null);
      setPesan([]);
    }, KARTU_RINGKAS_MS);
    return () => clearTimeout(t);
  }, [ringkas, besar]);

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
      // Dibangun ulang dari draftnya: asli → yang sudah kebaca → pertanyaan.
      tambah(
        meta?.ada_foto
          ? { t: "foto", src: `/api/draft/${id}/foto` }
          : { t: "saya", teks: t.source === "text" && t.raw_ocr_text ? t.raw_ocr_text : "📷 Struk" },
      );
      const tujuan = kantong.find((k) => k.id === t.kantong_tujuan_id)?.name;
      const kebaca = [
        t.merchant,
        t.category !== "other" ? namaKategori(kategori, t.category, t.type) : null,
        Number(t.amount) > 0 ? fmtIDR(Number(t.amount)) : null,
        t.kantong_id ? t.payment_method : null,
        tujuan ? `ke ${tujuan}` : null,
      ].filter(Boolean);
      tambah(kebaca.length ? { t: "app", teks: "Yang sudah kebaca:", sub: kebaca.join(" · ") } : { t: "app", teks: "Belum ada yang kebaca." });
      mulaiTanya(t, pertanyaanDraft(t) ?? "konfirmasi", 0);
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
    return () => d.removeEventListener("cancel", batal);
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
    setMenu(false);
    inputRef.current?.focus();
  }

  // Pertanyaan yang masih terbuka menentukan jenis kolom ketik.
  const tanyaBuka = aktif && pesan.some((p) => p.t === "tanya" && !p.selesai) ? aktif.jenis : null;
  const modeNominal = tanyaBuka === "nominal" && !lampiran;

  function kirim(e?: FormEvent) {
    e?.preventDefault();
    const isi = teks.trim();
    if (sibuk || (!isi && !lampiran)) return;
    if (isi.length > TEKS_MAKS) return tambah({ t: "app", teks: `Maksimal ${TEKS_MAKS} karakter.` });
    setTeks("");
    if (lampiran) {
      const l = lampiran;
      setLampiran(null);
      return void catatFoto(l.file, l.url, isi);
    }
    // Ketikan saat ada pertanyaan = jawabannya. Saat konfirmasi, ketikan
    // dianggap koreksi yang dibaca ulang.
    if (tanyaBuka) return void jawab(isi, undefined, tanyaBuka === "konfirmasi" ? "cerita" : undefined);
    // Setelah transaksi tersimpan, "eh yang tadi pakai BCA" = koreksi untuknya.
    const terakhir = [...pesan].reverse().find((p) => p.t === "kartu");
    if (terakhir?.t === "kartu" && !terakhir.batal && apakahKoreksi(isi)) return void koreksi(terakhir.tx, isi);
    void catatTeks(isi);
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
  }

  async function batalkanKoreksi(i: number) {
    const p = pesan[i];
    if (p?.t !== "koreksi" || sibuk) return;
    setSibuk(true);
    const { data } = await db.from("transactions").update(p.sebelum).eq("id", p.id).select().single();
    // Biaya admin / cashback ikut kembali ke kantong semula.
    if ("kantong_id" in p.sebelum) {
      await db.from("transactions").update({ kantong_id: p.sebelum.kantong_id, payment_method: p.sebelum.payment_method }).eq("induk_id", p.id);
    }
    setSibuk(false);
    if (!data) return tambah({ t: "app", teks: "Gagal membatalkan perubahannya." });
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

  async function batalkan(tx: Transaction) {
    await db.from("transactions").delete().eq("id", tx.id);
    setPesan((prev) => prev.map((p) => (p.t === "kartu" && p.tx.id === tx.id ? { ...p, batal: true } : p)));
    setRingkas((r) => (r && r.tx.id === tx.id ? { ...r, batal: true } : r));
    router.refresh();
  }

  const pilihanKantong = (jenis: JenisTanya) =>
    kantong.filter((k) =>
      jenis === "kantong_tujuan" ? k.id !== aktif?.tx.kantong_id : aktif?.tx.type === "transfer" || k.kind !== "orang",
    );

  /** `hilang`: kartu di lembar ringkas — bilah sisa waktu sebelum hilang sendiri. */
  function kartu(tx: Transaction, perbaikan: boolean, batal?: boolean, key?: number, hilang?: boolean) {
    const { ikon: Ikon, warna } = tandaTransaksi(tx, kategori);
    const nama = namaKategori(kategori, tx.category, tx.type);
    const tanda = tx.type === "expense" ? "−" : tx.type === "income" ? "+" : "";
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
          </span>
          <span className={s.nominal}>
            {tanda}
            {fmtIDR(Number(tx.amount))}
          </span>
        </div>
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
                <button type="button" className={s.flat} onClick={() => keDetail(tx)}>Ubah</button>
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
      case "koreksi":
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            {p.dibatalkan ? "Perubahannya dibatalkan." : "Sudah diubah:"}
            {!p.dibatalkan && p.perubahan.map((x) => <small key={x}>{x}</small>)}
            {!p.dibatalkan && (
              <div className={s.pilihanJawab}>
                <button type="button" disabled={sibuk} onClick={() => void batalkanKoreksi(i)}>
                  ↩ Batalkan perubahan
                </button>
              </div>
            )}
          </div>
        );
      case "tutup":
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            Makasih udah dilengkapi! 🙌 Transaksinya sudah tercatat. Kalau perlu diubah lagi, cek di Riwayat.
            {/* Bilah sisa waktu yang sama dengan kartu di lembar ringkas, tanpa
                teks: habis → ke daftar (kalau masih ada) atau Beranda. */}
            {detik !== null && (
              <span
                className={s.sisaWaktu}
                style={{ animationDuration: `${TUTUP_DETIK}s`, margin: "10px 0 2px" }}
                role="timer"
                aria-label={p.lagi > 0 ? `Lanjut ke catatan berikutnya dalam ${TUTUP_DETIK} detik` : `Kembali ke Beranda dalam ${TUTUP_DETIK} detik`}
              />
            )}
          </div>
        );
      case "tanya": {
        const buka = !p.selesai && !sibuk;
        return (
          <div key={i} className={`${s.bub} ${s.bubApp}`}>
            {p.teks}
            {buka && (p.jenis === "kantong" || p.jenis === "kantong_tujuan") && (
              <div className={s.pilihanJawab}>
                {pilihanKantong(p.jenis).map((k) => (
                  <button key={k.id} type="button" onClick={() => void jawab(k.id, k.name)}>
                    {k.emoji ? `${k.emoji} ` : ""}
                    {k.name}
                  </button>
                ))}
              </div>
            )}
            {buka && p.jenis === "konfirmasi" && aktif && (
              <div className={s.pilihanJawab}>
                <button type="button" onClick={() => void jawab("ya", "Ya, simpan")}>✓ Ya, simpan</button>
                <button type="button" onClick={() => keDetail(aktif.tx)}>📝 Ubah manual</button>
              </div>
            )}
            {buka && p.jenis === "manual" && aktif && (
              <div className={s.pilihanJawab}>
                <button type="button" onClick={() => keDetail(aktif.tx)}>📝 Isi manual</button>
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
        className={`${s.dialog} ${besar ? s.dialogBesar : ""}`}
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
              <div className={s.pintasan}>
                {[
                  { label: "Kamera", ikon: Camera, warna: "#3e91ff", aksi: () => setKamera(true) },
                  { label: "Galeri", ikon: IkonGambar, warna: "#5ecb7a", aksi: () => galeriRef.current?.click() },
                  { label: "Manual", ikon: ClipboardPen, warna: "#ff9f43", aksi: onManual },
                ].map(({ label, ikon: Ikon, warna, aksi }) => (
                  <button key={label} type="button" className={s.tekan} disabled={sibuk} onClick={aksi}>
                    <span style={{ background: `color-mix(in srgb, ${warna} 18%, transparent)`, color: warna }} aria-hidden>
                      <Ikon size={22} />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
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
              {ringkas ? (
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
                Yang belum lengkap disimpan di sini sampai {UMUR_DRAFT_HARI} hari, lalu dihapus otomatis. Begitu dilengkapi, foto &amp;
                obrolannya ikut dihapus.
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
                          {KURANG[pertanyaanDraft(d.tx) ?? "konfirmasi"]}
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
            {besar && menu && (
              <div className={s.menuKlip}>
                <button type="button" onClick={() => { setMenu(false); setKamera(true); }}>
                  <Camera size={18} /> Kamera
                </button>
                <button type="button" onClick={() => { setMenu(false); galeriRef.current?.click(); }}>
                  <IkonGambar size={18} /> Galeri
                </button>
                <button type="button" onClick={() => { setMenu(false); onManual(); }}>
                  <ClipboardPen size={18} /> Manual
                </button>
              </div>
            )}
            {lampiran && (
              <div className={s.lampiranCatat}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lampiran.url} alt="Foto yang dilampirkan" />
                <button type="button" aria-label="Hapus foto" onClick={() => setLampiran(null)}>
                  <X size={14} />
                </button>
              </div>
            )}
            <form onSubmit={kirim} className={s.ketik}>
              {besar && (
                <button type="button" className={s.klip} aria-label="Lampirkan" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                  <Paperclip size={22} />
                </button>
              )}
              <input
                ref={inputRef}
                aria-label="Tulis transaksinya"
                value={teks}
                onChange={(e) => setTeks(modeNominal ? angkaRibuan(angkaMentah(e.target.value)) : e.target.value)}
                inputMode={modeNominal ? "numeric" : "text"}
                placeholder={
                  lampiran
                    ? "Tambah keterangan (opsional)…"
                    : tanyaBuka === "nominal"
                      ? "Ketik nominalnya, mis. 150.000"
                      : tanyaBuka === "kantong" || tanyaBuka === "kantong_tujuan"
                        ? "Pilih di atas, atau ketik kantongnya"
                        : tanyaBuka === "cerita"
                          ? "Ceritain transaksinya…"
                          : tanyaBuka === "konfirmasi" || (besar && pesan.at(-1)?.t === "kartu")
                            ? "Ada yang salah? Ketik koreksinya"
                            : "beli makan di warteg 20k shopeepay"
                }
                disabled={sibuk && !besar}
                enterKeyHint="send"
                autoComplete="off"
              />
              <button type="submit" className={s.kirim} aria-label="Kirim" disabled={sibuk || (!teks.trim() && !lampiran)}>
                {sibuk && !besar ? <Spinner /> : <ArrowUp size={22} />}
              </button>
            </form>
          </div>
        )}

        <input
          ref={galeriRef}
          type="file"
          accept={ACCEPT_STRUK}
          hidden
          onChange={(e) => {
            lampirkan(e.target.files?.[0]);
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
    </>
  );
}
