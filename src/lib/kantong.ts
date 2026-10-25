import type { SupabaseClient } from "@supabase/supabase-js";
import { ikutSaldo, saldoSejak } from "@/lib/waktu";

/**
 * Kantong = rekening, dompet digital, atau uang tunai milik user (tabel
 * `user_accounts`). Fungsi murni — diuji di scripts/uji-kantong.mts.
 */

/**
 * Jenis di database. "cash" hanya untuk kantong Tunai bawaan; kantong buatan
 * user tidak memilih jenis — cukup emoji sebagai penanda.
 */
export type JenisKantong = "bank" | "ewallet" | "cash" | "orang" | "kredit" | "tujuan";

/** Pilihan cepat emoji kantong; emoji lain bisa diketik dari keyboard. */
export const SARAN_EMOJI_KANTONG = ["🏦", "💳", "📱", "👛", "💰", "🐷", "💼", "🪙", "🏧", "💵"];

/** Emoji kantong; data lama tanpa emoji memakai tebakan dari jenisnya. */
export function emojiKantong(k: { emoji?: string | null; kind: string }): string {
  return k.emoji || (k.kind === "cash" ? "💵" : k.kind === "ewallet" ? "📱" : "🏦");
}

/** Emoji terakhir di teks (satu grafem, mis. 👨‍👩‍👧 utuh), atau null kalau bukan emoji. */
export function ambilEmoji(teks: unknown): string | null {
  if (typeof teks !== "string") return null;
  const grafem = [...new Intl.Segmenter("id", { granularity: "grapheme" }).segment(teks.trim())].map((g) => g.segment);
  const akhir = grafem.at(-1);
  return akhir && /\p{Extended_Pictographic}/u.test(akhir) ? akhir : null;
}

export interface Kantong {
  id: string;
  name: string;
  kind: JenisKantong;
  aliases: string[] | null;
  saldo_awal: number | string;
  /** "YYYY-MM-DD": tanggal WIB dari saldo_sejak (disinkronkan trigger database). */
  saldo_per: string;
  /** Sejak kapan saldo_awal berlaku (timestamptz). Lihat SPEC-saldo-waktu.md. */
  saldo_sejak?: string | null;
  /** Kantong tunai bawaan: tidak bisa dihapus, jenisnya tetap tunai. */
  bawaan?: boolean;
  emoji?: string | null;
  /** Hanya kantong orang: jatuh tempo pinjaman (opsional). */
  jatuh_tempo?: string | null;
  /** Hanya kantong tujuan tabungan (SPEC-tujuan-tabungan). */
  target?: number | string | null;
  tenggat?: string | null;
}

/**
 * Nama lain yang dipakai bank/dompet di aplikasinya dan yang biasa diketik
 * orang. Pengetahuan umum, bukan data user — jadi di kode, bukan di database.
 * Kuncinya nama kantong yang dinormalkan (lihat `normal`).
 */
const ALIAS_BAWAAN: Record<string, string[]> = {
  // --- Bank ---
  bri: ["BRImo", "BRI Mobile", "Bank BRI", "Bank Rakyat Indonesia"],
  bca: ["myBCA", "BCA Mobile", "KlikBCA", "Bank Central Asia"],
  mandiri: ["Livin", "Livin by Mandiri", "Bank Mandiri"],
  bni: ["Wondr", "BNI Mobile", "Bank Negara Indonesia"],
  bsi: ["BSI Mobile", "Bank Syariah Indonesia", "Byond"],
  btn: ["Bank BTN", "Bale"],
  cimb: ["OCTO", "OCTO Mobile", "CIMB Niaga"],
  permata: ["PermataMobile", "PermataBank"],
  danamon: ["D-Bank", "Bank Danamon"],
  jago: ["Bank Jago"],
  seabank: ["Sea Bank", "SeaBank Indonesia"],
  jenius: ["BTPN", "Bank BTPN"],
  blu: ["blu by BCA Digital", "BCA Digital"],
  neo: ["Bank Neo Commerce", "Neobank"],
  allo: ["Allo Bank"],
  superbank: ["Super Bank"],

  // --- E-wallet ---
  shopeepay: ["Shopee", "SPay", "Shopee Pay", "Sopipay"],
  gopay: ["Gojek", "Go-Pay", "Go Pay"],
  linkaja: ["Link Aja", "LinkAja!"],
  tunai: ["Cash", "COD", "Uang tunai", "Dompet"],
};

/** "Shopee Pay" → "shopeepay": huruf kecil, tanpa spasi & tanda baca. */
export const normal = (teks: string) => teks.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Kantong yang dimaksud teks metode bayar ("gopay", "BRImo", "Tunai"), atau
 * null kalau tidak ada yang cocok persis. Sengaja persis, bukan "mengandung":
 * "Transfer" atau "QRIS" tidak boleh nyasar ke kantong mana pun.
 */
export function cocokkanKantong<K extends Pick<Kantong, "name"> & Partial<Pick<Kantong, "aliases">>>(
  teks: string | null | undefined,
  daftar: K[],
): K | null {
  const cari = normal(teks ?? "");
  if (!cari) return null;
  return (
    daftar.find((k) => {
      const nama = [k.name, ...(ALIAS_BAWAAN[normal(k.name)] ?? []), ...(k.aliases ?? [])];
      return nama.some((n) => normal(n) === cari);
    }) ?? null
  );
}

/**
 * Kenapa transaksi jadi draft ("Perlu dibenerin"): nominalnya tidak terbaca,
 * atau nominalnya terbaca tapi kantongnya (atau tujuan pindah kantong) belum
 * jelas. Null kalau bukan draft.
 */
export function alasanDraft(t: {
  status: string;
  amount: number | string;
  type: string;
  kantong_id: string | null;
  kantong_tujuan_id: string | null;
  bukti_transfer?: string | null;
}): "baca" | "kantong" | "arah" | null {
  if (t.status !== "needs_review") return null;
  // Bukti transfer antar dua pihak yang belum jelas kirim atau terima (SPEC-catat-tuntas).
  if (t.bukti_transfer && Number(t.amount) > 0) return "arah";
  const kurangKantong = !t.kantong_id || (t.type === "transfer" && !t.kantong_tujuan_id);
  return Number(t.amount) > 0 && kurangKantong ? "kantong" : "baca";
}

export interface BarisSaldo {
  amount: number | string;
  type: string;
  transaction_date: string;
  /** Jam transaksi (WIB), opsional. */
  waktu?: string | null;
  kantong_id: string | null;
  kantong_tujuan_id: string | null;
}

/**
 * Saldo tiap kantong = saldo_awal + masuk − keluar − pindah keluar + pindah
 * masuk, dari transaksi sejak saldo_sejak (di hari itu: pada/sesudah jamnya;
 * tanpa jam dianggap sesudah). Sama dengan RPC saldo_kantong(). `transaksi`
 * cukup yang terkonfirmasi; draft belum bisa dipercaya nominalnya.
 */
export function hitungSaldo(daftar: Kantong[], transaksi: BarisSaldo[]): { id: string; saldo: number }[] {
  const saldo = new Map(daftar.map((k) => [k.id, Number(k.saldo_awal)]));
  const sejak = new Map(daftar.map((k) => [k.id, saldoSejak(k)]));
  const tambah = (id: string | null, n: number, t: BarisSaldo) => {
    if (id && saldo.has(id) && ikutSaldo(t, sejak.get(id)!)) saldo.set(id, saldo.get(id)! + n);
  };

  for (const t of transaksi) {
    const n = Number(t.amount);
    if (t.type === "income") tambah(t.kantong_id, n, t);
    else if (t.type === "expense") tambah(t.kantong_id, -n, t);
    else if (t.type === "transfer") {
      tambah(t.kantong_id, -n, t);
      tambah(t.kantong_tujuan_id, n, t);
    }
  }
  return daftar.map((k) => ({ id: k.id, saldo: saldo.get(k.id)! }));
}

/**
 * Kantong milik user beserta saldonya sekarang. Dipanggil di server.
 *
 * Saldo dijumlah di database (RPC saldo_kantong, aturannya sama dengan
 * hitungSaldo): yang diunduh hanya satu angka per kantong, bukan seluruh
 * riwayat transaksi — egress Supabase tidak ikut tumbuh bersama riwayat.
 */
export async function ambilKantong(supabase: SupabaseClient): Promise<{ kantong: Kantong[]; saldo: Map<string, number> }> {
  const [{ data }, { data: saldo, error }] = await Promise.all([
    supabase.from("user_accounts").select("*").order("created_at"),
    supabase.rpc("saldo_kantong"),
  ]);
  // Saldo yang diam-diam nol lebih buruk daripada halaman yang gagal dimuat.
  if (error) throw new Error(`saldo_kantong: ${error.message}`);
  return {
    kantong: (data ?? []) as Kantong[],
    saldo: new Map(((saldo ?? []) as { id: string; saldo: number | string }[]).map((s) => [s.id, Number(s.saldo)])),
  };
}
