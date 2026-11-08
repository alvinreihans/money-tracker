import { fmtIDR, fmtTanggalPendek } from "@/lib/format";
import { NAMA_BANK, type Bank } from "@/lib/rekening/jenis";
import type { ExtractedReceipt } from "@/types/transaction";

/**
 * "Cara dicatat" (docs/specs/SPEC-periksa-dulu.md §4): jejak pencatatan sebuah
 * transaksi — asal, teks ketikan / ringkasan hasil baca AI, tanya-jawab &
 * koreksi berurutan, waktu Simpan, dan thumbnail gambarnya (K1). Disimpan
 * terenkripsi di private.jejak_catat lewat RPC (jejak sementara selama draft
 * di private.draft_catat). Fungsi murni — diuji di scripts/uji-draft.mts.
 */

export type AsalJejak = "ketikan" | "gambar" | "bukti" | "banyak" | "lengkapi" | "koreksi";

export interface LangkahJejak {
  /** tanya = pertanyaan aplikasi; jawab = jawaban user; koreksi = ketikan yang membetulkan isinya. */
  t: "tanya" | "jawab" | "koreksi";
  teks: string;
}

/** Ringkasan hasil baca AI saat catatan dibuat (bukan isi akhir transaksinya). */
export interface BacaanJejak {
  jenis?: string | null;
  merchant?: string | null;
  nominal?: number | null;
  tanggal?: string | null;
  jam?: string | null;
  sumber?: string | null;
  tujuan?: string | null;
  pengirim?: string | null;
  penerima?: string | null;
}

export interface IsiJejak {
  asal?: AsalJejak;
  /** Teks yang diketik (asal ketikan) atau keterangan yang dikirim bersama gambar. */
  teks?: string | null;
  bacaan?: BacaanJejak | null;
  langkah?: LangkahJejak[];
  /** Waktu Simpan (ISO). */
  disimpan?: string;
  /** Cara menyimpan: kartu periksa, Simpan semua, form Ubah, atau Lengkapi. */
  cara?: "kartu" | "semua" | "form" | "lengkapi";
}

/** Asal catatan dari kolom source & cara unggahnya. */
export function asalJejak(source: string | null | undefined, banyak = false): AsalJejak {
  if (source === "text") return "ketikan";
  if (banyak) return "banyak";
  return source === "payment_proof" ? "bukti" : "gambar";
}

/** Ringkasan hasil baca AI: hanya isian yang terbaca. */
export function bacaanDari(e: ExtractedReceipt | null | undefined): BacaanJejak | null {
  if (!e) return null;
  const b: BacaanJejak = {
    jenis: e.type ?? null,
    merchant: e.merchant ?? null,
    nominal: Number(e.amount) > 0 ? Number(e.amount) : null,
    tanggal: e.transaction_date ?? null,
    jam: e.time ?? null,
    sumber: e.sumber_dana ?? e.payment_method ?? null,
    tujuan: e.payment_target ?? null,
    pengirim: e.bukti_transfer?.pengirim?.nama ?? null,
    penerima: e.bukti_transfer?.penerima?.nama ?? null,
  };
  const isi = Object.fromEntries(Object.entries(b).filter(([, v]) => v != null && v !== "")) as BacaanJejak;
  return Object.keys(isi).length ? isi : null;
}

/** Sama dengan private.gabung_jejak: kunci biasa ditimpa, langkah disambung (60 terakhir). */
export function gabungJejak(lama: IsiJejak | null | undefined, baru: IsiJejak | null | undefined): IsiJejak {
  const { langkah: a = [], ...l } = lama ?? {};
  const { langkah: b = [], ...n } = baru ?? {};
  return { ...l, ...n, langkah: [...a, ...b].slice(-60) };
}

/** Tanya-jawab satu pertanyaan obrolan; jawaban kosong tidak dicatat. */
export function langkahJawab(tanya: string, jawab: string): LangkahJejak[] {
  const j = jawab.trim().slice(0, 300);
  return j ? [{ t: "tanya", teks: tanya.slice(0, 300) }, { t: "jawab", teks: j }] : [];
}

const JENIS_BACA: Record<string, string> = { expense: "keluar", income: "masuk", transfer: "pindah kantong" };

/** "Kebaca: Warung Uji · Rp 42.000 · 8 Nov · dari BCA" untuk gelembung pertama. */
export function teksBacaan(b: BacaanJejak | null | undefined): string | null {
  if (!b) return null;
  const bagian = [
    b.merchant,
    b.nominal ? fmtIDR(b.nominal) : null,
    b.jenis && b.jenis !== "expense" ? JENIS_BACA[b.jenis] : null,
    b.tanggal ? `${fmtTanggalPendek(b.tanggal)}${b.jam ? ` ${b.jam.slice(0, 5).replace(":", ".")}` : ""}` : null,
    b.pengirim && b.penerima ? `${b.pengirim} → ${b.penerima}` : null,
    b.sumber ? `dari ${b.sumber}` : null,
    b.tujuan ? `ke ${b.tujuan}` : null,
  ].filter(Boolean);
  return bagian.length ? `Kebaca: ${bagian.join(" · ")}` : null;
}

const NAMA_ASAL: Record<AsalJejak, string> = {
  ketikan: "Diketik di Catat",
  gambar: "Dari gambar di Catat",
  bukti: "Dari bukti transfer di Catat",
  banyak: "Dari unggah banyak gambar",
  lengkapi: "Dilengkapi dari gambar",
  koreksi: "Dikoreksi lewat ketikan",
};

const NAMA_CARA: Record<NonNullable<IsiJejak["cara"]>, string> = {
  kartu: "Disimpan dari kartu periksa",
  semua: "Disimpan lewat Simpan semua",
  form: "Disimpan dari form Ubah",
  lengkapi: "Dilengkapi",
};

export interface Gelembung {
  dari: "saya" | "app" | "info";
  teks: string;
  /** Id baris jejak yang fotonya ditampilkan (asal gambar). */
  foto?: number;
}

/**
 * Gelembung percakapan ringkas hanya-baca untuk "Cara dicatat", dari baris-baris
 * jejak berurutan. `jam`: format waktu Simpan (diberikan pemanggil, zona WIB).
 */
export function gelembungJejak(baris: { id: number; isi: IsiJejak; ada_foto: boolean }[], jam: (iso: string) => string): Gelembung[] {
  const hasil: Gelembung[] = [];
  for (const { id, isi, ada_foto } of baris) {
    if (isi.asal) hasil.push({ dari: "info", teks: NAMA_ASAL[isi.asal] ?? "Dicatat" });
    if (ada_foto) hasil.push({ dari: "saya", teks: "Gambar", foto: id });
    if (isi.teks) hasil.push({ dari: "saya", teks: isi.teks });
    const baca = teksBacaan(isi.bacaan);
    if (baca) hasil.push({ dari: "app", teks: baca });
    for (const l of isi.langkah ?? []) {
      if (!l?.teks) continue;
      hasil.push(l.t === "tanya" ? { dari: "app", teks: l.teks } : { dari: "saya", teks: l.t === "koreksi" ? `Koreksi: ${l.teks}` : l.teks });
    }
    if (isi.disimpan) hasil.push({ dari: "info", teks: `${isi.cara ? NAMA_CARA[isi.cara] : "Disimpan"} · ${jam(isi.disimpan)}` });
  }
  return hasil;
}

/**
 * Transaksi rekening koran: jejaknya dari kolom yang sudah ada (tidak disimpan
 * dua kali) — bank dari awalan ref_bank, uraian baris dari keterangan. PDF dan
 * nama berkasnya tidak disimpan (K1).
 */
export function jejakRekening(t: { source: string; ref_bank?: string | null; description?: string | null }): Gelembung[] | null {
  if (t.source !== "statement") return null;
  // Awalan pengenal baris per parser: "sea:", "jago:", "bri:" (src/lib/rekening/*.ts).
  const awalan = t.ref_bank?.split(":")[0];
  const bank = (awalan === "sea" ? "seabank" : awalan) as Bank | undefined;
  const nama = bank && bank in NAMA_BANK ? NAMA_BANK[bank] : null;
  return [
    { dari: "info", teks: `Diimpor dari rekening koran${nama ? ` ${nama}` : ""}` },
    ...(t.description ? [{ dari: "saya" as const, teks: `Baris bank: ${t.description}` }] : []),
  ];
}
