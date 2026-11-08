import { kantongBank } from "@/lib/arah";
import { cocokkanKantong, type Kantong } from "@/lib/kantong";
import { namaLembaga } from "@/lib/lembaga";
import { penyediaPaylater } from "@/lib/paylater-nama";

/**
 * Petunjuk kantong untuk draft obrolan (SPEC-kantong-sendiri A-1, B-2, B-4, D-2):
 * nama kantong yang terbaca tapi belum ada, supaya obrolan bisa menawarkan
 * "+ Buat kantong <nama>" — juga saat draft dibuka lagi dari "Belum selesai".
 *
 * Disimpan sebagai JSON di kolom `bukti_transfer` draft (tanpa kolom baru):
 * `{ petunjuk: {...} }`, atau di samping `pengirim`/`penerima` bila arahnya
 * juga belum jelas. Bukti transfer sungguhan dikenali dari `pengirim` &
 * `penerima` (bacaBukti), jadi petunjuk saja tidak memicu pertanyaan arah.
 * Dikosongkan begitu draft selesai. Fungsi murni — diuji di scripts/uji-draft.mts.
 */

export interface Petunjuk {
  /** Nama kantong asal yang terbaca (sumber dana / bank pengirim / penyedia paylater). */
  sumber?: string | null;
  /** Nama kantong tujuan yang terbaca (e-wallet / bank penerima / kantong utang paylater). */
  tujuan?: string | null;
  /** 4 digit akhir rekening tujuan dari gambar (B-2): disimpan ke nomor_akhir kantong baru. */
  nomor_tujuan?: string | null;
  /** B-4: uang masuk dari bank/e-wallet ini (lembaga, bukan orang) yang belum jadi kantong — ditanya "dari rekeningmu sendiri?". */
  lembaga?: string | null;
  /** D-2: bayar tagihan paylater penyedia ini, beberapa rencana cicilan cocok — ditanya "Cicilan yang mana?". */
  cicilan?: string | null;
  /** Hasil AI ragu (angka tidak terbaca pasti): tidak ikut "Simpan semua" (SPEC-periksa-dulu §2). */
  ragu?: boolean | null;
  /** User belum punya kantong sama sekali: tidak ditanya "Pakai kantong apa?" (dicatat tanpa kantong seperti dulu). */
  tanpa_kantong?: boolean | null;
}

/** Petunjuk dari kolom `bukti_transfer` (JSON); {} bila kosong/rusak. */
export function bacaPetunjuk(nilai: unknown): Petunjuk {
  if (!nilai) return {};
  try {
    const x = (typeof nilai === "string" ? JSON.parse(nilai) : nilai) as { petunjuk?: unknown };
    return x?.petunjuk && typeof x.petunjuk === "object" ? (x.petunjuk as Petunjuk) : {};
  } catch {
    return {};
  }
}

/**
 * Isi kolom `bukti_transfer` dengan petunjuk `p` (digabung ke isi lama, mis. bukti
 * transfer yang arahnya belum jelas). Petunjuk kosong & tanpa bukti → null.
 */
export function simpanPetunjuk(nilai: unknown, p: Petunjuk): string | null {
  let lama: Record<string, unknown> = {};
  try {
    lama = nilai ? ((typeof nilai === "string" ? JSON.parse(nilai) : nilai) as Record<string, unknown>) ?? {} : {};
  } catch {
    lama = {};
  }
  const isi = Object.fromEntries(Object.entries({ ...((lama.petunjuk as Petunjuk) ?? {}), ...p }).filter(([, v]) => v != null && v !== ""));
  const { petunjuk: _, ...sisa } = lama;
  void _;
  const hasil = { ...sisa, ...(Object.keys(isi).length ? { petunjuk: isi } : {}) };
  return Object.keys(hasil).length ? JSON.stringify(hasil) : null;
}

/** Kata yang menyebut cara bayar, bukan nama kantong. */
const BUKAN_KANTONG = /^(qris|transfer|tf|kartu|debit|kredit|kartu debit|e-?wallet|m-?banking|mbanking|internet banking|va|virtual account|saldo|lainnya|other|-)$/i;

/**
 * Nama kantong baru yang masuk akal dari teks yang terbaca/diketik:
 * paylater → nama baku penyedianya (kantong utang, K3); bank/e-wallet yang dikenal → nama
 * bakunya ("BANK JAGO" → "Jago"); tunai/cash → "Tunai"; cara bayar ("QRIS", "Transfer") →
 * null; selain itu teksnya dirapikan (maks 3 kata, tanpa angka).
 */
export function namaKantongBaru(teks: string | null | undefined): string | null {
  const t = (teks ?? "")
    .replace(/^\s*(kantong|pakai|pake|dari|ke|lewat|via|saldo|rekening|rek)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || BUKAN_KANTONG.test(t)) return null;
  const baku = penyediaPaylater(t) ?? namaLembaga(t);
  if (baku) return baku;
  if (/\b(tunai|cash|uang tunai|cod)\b/i.test(t)) return "Tunai";
  if (/\d/.test(t) || t.split(" ").length > 3 || !/[a-z]/i.test(t)) return null;
  const rapi = t === t.toUpperCase() && t.length > 4 ? t.toLowerCase().replace(/(^|\s)\S/g, (h) => h.toUpperCase()) : t;
  return rapi.slice(0, 40);
}

type KantongCocok = Pick<Kantong, "name"> & Partial<Pick<Kantong, "aliases">>;

/** Nama itu sudah cocok dengan kantong yang ada? (nama, alias, atau nama bank ringkas). */
export const sudahAda = (nama: string, daftar: KantongCocok[]) => Boolean(cocokkanKantong(nama, daftar) ?? kantongBank(nama, daftar));

/**
 * Nama untuk pilihan "+ Buat kantong <nama>" di pertanyaan `jenis` (A-1): yang terbaca
 * untuk sisi yang ditanya, hanya bila belum cocok dengan kantong mana pun.
 */
export function usulanKantongBaru(
  jenis: string,
  tx: { payment_method?: string | null; bukti_transfer?: string | null },
  daftar: KantongCocok[],
): string | null {
  const p = bacaPetunjuk(tx.bukti_transfer);
  const teks = jenis === "kantong_tujuan" ? p.tujuan : jenis === "kantong" ? (p.sumber ?? tx.payment_method) : null;
  const nama = namaKantongBaru(teks);
  return nama && !sudahAda(nama, daftar) ? nama : null;
}

/** Empat digit akhir dari "JAGO …4321" / "BCA 1234567890"; null bila tidak ada. */
export function nomorAkhir(rekening: string | null | undefined): string | null {
  const m = rekening?.match(/(\d{4})\D*$/);
  return m ? m[1] : null;
}

/** Bank/e-wallet dari "JAGO …4321" (tanpa nomornya). */
export const bankRekening = (rekening: string | null | undefined) => rekening?.replace(/[\s.*…:•-]*\d[\d\s]*$/, "").trim() || null;
