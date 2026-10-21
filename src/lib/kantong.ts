import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Kantong = rekening, dompet digital, atau uang tunai milik user (tabel
 * `user_accounts`). Fungsi murni — diuji di scripts/uji-kantong.mts.
 */

export type JenisKantong = "bank" | "ewallet" | "cash";

export const JENIS_KANTONG: { id: JenisKantong; label: string }[] = [
  { id: "bank", label: "Bank" },
  { id: "ewallet", label: "E-wallet" },
  { id: "cash", label: "Tunai" },
];

export interface Kantong {
  id: string;
  name: string;
  kind: JenisKantong;
  aliases: string[] | null;
  saldo_awal: number | string;
  /** "YYYY-MM-DD": saldo_awal adalah saldo di awal tanggal ini. */
  saldo_per: string;
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
const normal = (teks: string) => teks.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Kantong yang dimaksud teks metode bayar ("gopay", "BRImo", "Tunai"), atau
 * null kalau tidak ada yang cocok persis. Sengaja persis, bukan "mengandung":
 * "Transfer" atau "QRIS" tidak boleh nyasar ke kantong mana pun.
 */
export function cocokkanKantong<K extends Pick<Kantong, "name" | "aliases">>(
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

export interface BarisSaldo {
  amount: number | string;
  type: string;
  transaction_date: string;
  kantong_id: string | null;
  kantong_tujuan_id: string | null;
}

/**
 * Saldo tiap kantong = saldo_awal + masuk − keluar − pindah keluar + pindah
 * masuk, dari transaksi bertanggal saldo_per atau sesudahnya. `transaksi`
 * cukup yang terkonfirmasi; draft belum bisa dipercaya nominalnya.
 */
export function hitungSaldo(daftar: Kantong[], transaksi: BarisSaldo[]): { id: string; saldo: number }[] {
  const saldo = new Map(daftar.map((k) => [k.id, Number(k.saldo_awal)]));
  const per = new Map(daftar.map((k) => [k.id, k.saldo_per]));
  const tambah = (id: string | null, n: number, tanggal: string) => {
    if (id && saldo.has(id) && tanggal >= per.get(id)!) saldo.set(id, saldo.get(id)! + n);
  };

  for (const t of transaksi) {
    const n = Number(t.amount);
    if (t.type === "income") tambah(t.kantong_id, n, t.transaction_date);
    else if (t.type === "expense") tambah(t.kantong_id, -n, t.transaction_date);
    else if (t.type === "transfer") {
      tambah(t.kantong_id, -n, t.transaction_date);
      tambah(t.kantong_tujuan_id, n, t.transaction_date);
    }
  }
  return daftar.map((k) => ({ id: k.id, saldo: saldo.get(k.id)! }));
}

const KOLOM_SALDO = "amount, type, transaction_date, kantong_id, kantong_tujuan_id";

/** Kantong milik user beserta saldonya sekarang. Dipanggil di server. */
export async function ambilKantong(supabase: SupabaseClient): Promise<{ kantong: Kantong[]; saldo: Map<string, number> }> {
  const { data } = await supabase
    .from("user_accounts")
    .select("id, name, kind, aliases, saldo_awal, saldo_per")
    .order("created_at");
  const kantong = (data ?? []) as Kantong[];
  if (kantong.length === 0) return { kantong, saldo: new Map() };

  // PostgREST membatasi 1000 baris per permintaan, jadi diambil per halaman —
  // saldo yang diam-diam terpotong lebih buruk daripada query tambahan.
  // ponytail: dijumlah di sini, bukan di SQL; pindah ke RPC kalau barisnya puluhan ribu.
  const awal = kantong.reduce((m, k) => (k.saldo_per < m ? k.saldo_per : m), kantong[0].saldo_per);
  const baris: BarisSaldo[] = [];
  for (let dari = 0; ; dari += 1000) {
    const { data: halaman } = await supabase
      .from("transactions")
      .select(KOLOM_SALDO)
      .eq("status", "confirmed")
      .or("kantong_id.not.is.null,kantong_tujuan_id.not.is.null")
      .gte("transaction_date", awal)
      .order("id")
      .range(dari, dari + 999);
    baris.push(...((halaman ?? []) as BarisSaldo[]));
    if (!halaman || halaman.length < 1000) break;
  }
  return { kantong, saldo: new Map(hitungSaldo(kantong, baris).map((s) => [s.id, s.saldo])) };
}
