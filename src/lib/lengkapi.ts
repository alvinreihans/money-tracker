import { cocokkanKantong, kantongDeposito, type Kantong } from "@/lib/kantong";
import { fmtIDR, geserHari } from "@/lib/format";
import type { BagianPecah, ExtractedReceipt } from "@/types/transaction";

/**
 * Lengkapi transaksi dari screenshot & struk (docs/specs/SPEC-lengkapi.md),
 * fungsi murni: pengenal bukti (`ref_bukti`), mencari pasangan transaksi yang
 * sudah tercatat (`cariPasangan`), dan isian yang diubah (`isianLengkapi`).
 * Nominal, tanggal, dan kantong transaksi yang dilengkapi tidak pernah diubah.
 */

// ---------------------------------------------------------------- pengenal bukti

/** "ss" = screenshot bukti bayar, "struk" = struk kasir. */
export type JenisBukti = "ss" | "struk";

export const jenisBukti = (e: Pick<ExtractedReceipt, "document_type">): JenisBukti => (e.document_type === "payment_proof" ? "ss" : "struk");

/**
 * Isi kolom `ref_bukti`: token dipisah spasi —
 *  - `ss:<Order SN>` / `struk:<nomor bon>`: sudah dilengkapi/dibuat oleh bukti jenis itu
 *    (`-` bila pengenalnya tidak terbaca);
 *  - `h:<sidik>`: sidik isi gambar, supaya gambar yang sama dikenali tanpa AI.
 */
export interface TokenRef {
  jenis: string;
  nilai: string;
}

export const bacaRef = (ref: string | null | undefined): TokenRef[] =>
  (ref ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const i = t.indexOf(":");
      return i > 0 ? { jenis: t.slice(0, i), nilai: t.slice(i + 1) } : { jenis: t, nilai: "" };
    });

/** Pengenal dibersihkan: huruf & angka besar ("ZZ01-234-5678ABCD" → "ZZ012345678ABCD"); terlalu pendek = tidak ada. */
export const rapikanRef = (r: string | null | undefined) => {
  const x = (r ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 60);
  return x.length >= 6 ? x : null;
};

/** Tambahkan token bukti ke `ref_bukti` yang ada (tanpa dobel, maks. 200 karakter). */
export function tambahRef(ref: string | null | undefined, jenis: JenisBukti, nilai: string | null, sidik?: string | null): string {
  const ada = bacaRef(ref);
  const baru: TokenRef[] = [{ jenis, nilai: rapikanRef(nilai) ?? "-" }, ...(sidik ? [{ jenis: "h", nilai: sidik }] : [])];
  for (const t of baru) {
    if (t.jenis === jenis && t.nilai === "-" && ada.some((x) => x.jenis === jenis)) continue;
    if (!ada.some((x) => x.jenis === t.jenis && x.nilai === t.nilai)) ada.push(t);
  }
  let teks = ada.map((t) => `${t.jenis}:${t.nilai}`).join(" ");
  while (teks.length > 200 && ada.some((t) => t.jenis === "h")) {
    ada.splice(ada.findIndex((t) => t.jenis === "h"), 1);
    teks = ada.map((t) => `${t.jenis}:${t.nilai}`).join(" ");
  }
  return teks.slice(0, 200);
}

/** Sudah dilengkapi (atau dibuat) oleh bukti sejenis? */
export const sudahJenis = (ref: string | null | undefined, jenis: JenisBukti) => bacaRef(ref).some((t) => t.jenis === jenis);

/**
 * Transaksi yang sudah memakai bukti ini (§5): sidik gambar sama, atau
 * pengenal (Order SN / nomor bon) sama dengan jenis yang sama.
 */
export function refDipakai<T extends { ref_bukti?: string | null }>(daftar: T[], cari: { jenis?: JenisBukti; nilai?: string | null; sidik?: string | null }): T | null {
  const nilai = rapikanRef(cari.nilai);
  return (
    daftar.find((t) =>
      bacaRef(t.ref_bukti).some((x) => (cari.sidik && x.jenis === "h" && x.nilai === cari.sidik) || (nilai && x.jenis === cari.jenis && x.nilai === nilai)),
    ) ?? null
  );
}

/**
 * Pengenal yang terbaca dari nama berkas, sebelum AI (§5): struk digital
 * Alfagift bernama "receipt-<kode toko>-<nomor bon>.png". Cocok bila pengenal
 * tersimpan (≥ 8 karakter) termuat utuh di nama berkas yang dibersihkan.
 */
export function refDariNamaBerkas<T extends { ref_bukti?: string | null }>(nama: string, daftar: T[]): T | null {
  const bersih = nama.replace(/\.[a-z0-9]+$/i, "").replace(/\(\d+\)/g, "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (bersih.length < 8) return null;
  return daftar.find((t) => bacaRef(t.ref_bukti).some((x) => (x.jenis === "ss" || x.jenis === "struk") && x.nilai.length >= 8 && bersih.includes(x.nilai))) ?? null;
}

// ---------------------------------------------------------------- mencari pasangan

export interface BuktiCocok {
  jenis: JenisBukti;
  type: "income" | "expense" | "transfer";
  /** Nominal yang terpotong dari rekening: "Kamu Membayar", atau total struk − voucher. */
  nominal: number;
  tanggal: string;
  /** "HH:MM" dari gambar. */
  jam: string | null;
  /** Kantong sumber dana; null = kantong mana pun (hanya e-wallet perantara yang terbaca). */
  kantong: string | null;
  /** Pindah kantong: kantong tujuannya (mis. tarik saldo ShopeePay ke SeaBank). */
  kantongTujuan?: string | null;
  /** Sumber dana terbaca tapi bukan kantong user (mis. Saldo ShopeePay tanpa kantong ShopeePay): tidak ada pasangan. */
  tanpaKantong?: boolean;
}

export interface CalonLengkapi {
  id: string;
  amount: number | string;
  type: string;
  transaction_date: string;
  waktu?: string | null;
  kantong_id: string | null;
  kantong_tujuan_id?: string | null;
  ref_bukti?: string | null;
  source?: string;
  /** Urutan baris rekening koran di kantong & hari itu (dari created_at); null bila bukan dari rekening koran. */
  urut?: number | null;
}

/** Baris rekening koran di kantong & hari yang sama (termasuk kandidat), untuk membandingkan urutan dengan jam gambar. */
export interface Tetangga {
  id: string;
  kantong_id: string | null;
  transaction_date: string;
  urut: number;
  waktu: string | null;
}

export interface HasilPasangan {
  /** Urut dari yang paling mungkin. */
  kandidat: CalonLengkapi[];
  /** Pasangannya pasti (kandidat pertama): dilengkapi otomatis saat unggah banyak (K1). */
  pasti: boolean;
}

/** Selisih jam gambar dengan jam transaksi yang dianggap "jamnya cocok" (menit). */
export const JAM_DEKAT = 15;

const menit = (j: string | null | undefined) => (j ? Number(j.slice(0, 2)) * 60 + Number(j.slice(3, 5)) : null);
const jamKe = (j: string | null | undefined) => (j ? j.slice(0, 5) : null);

/**
 * Transaksi tercatat yang dilengkapi bukti ini (§1). Kandidat: nominal sama
 * persis; tanggal sama (struk ≥ 22.00: atau sehari sebelum tanggal struk, karena kasir memakai tanggal bisnis berikutnya);
 * kantong sumber dana, atau kantong mana pun bila yang terbaca hanya e-wallet
 * perantara; belum dilengkapi oleh bukti sejenis. Beberapa kandidat: jam
 * paling dekat; baris rekening tanpa jam dibandingkan urutannya dengan jam
 * baris tetangga yang sudah dilengkapi; `peringkat` = urutan jam gambar ini di
 * antara gambar sebayar & setanggal di unggahan yang sama.
 */
export function cariPasangan(
  b: BuktiCocok,
  calon: CalonLengkapi[],
  opsi: { tetangga?: Tetangga[]; peringkat?: { ke: number; dari: number } | null } = {},
): HasilPasangan {
  if (b.tanpaKantong || !(b.nominal > 0)) return { kandidat: [], pasti: false };
  // Struk ≥ 22.00 bertanggal bisnis kasir (besoknya): baris bank-nya sehari sebelum tanggal struk.
  const tanggal = [b.tanggal, ...(b.jenis === "struk" && (menit(b.jam) ?? 0) >= 22 * 60 ? [geserHari(b.tanggal, -1)] : [])];
  const cocokKantong = (id: string | null | undefined) => b.kantong === null || id === b.kantong;
  const kandidat = calon.filter((t) => {
    if (Math.abs(Number(t.amount) - b.nominal) >= 0.005 || !tanggal.includes(t.transaction_date) || sudahJenis(t.ref_bukti, b.jenis)) return false;
    const keluar = (t.type === "expense" || t.type === "transfer") && cocokKantong(t.kantong_id);
    const masukKe = (id: string | null | undefined) =>
      (t.type === "income" && t.kantong_id === id) || (t.type === "transfer" && t.kantong_tujuan_id === id);
    if (b.type === "expense") return keluar;
    if (b.type === "income") return b.kantong === null ? t.type === "income" || t.type === "transfer" : masukKe(b.kantong);
    // Pindah kantong: sisi asal (kantong sumber) atau sisi tujuan.
    if (b.kantong === null && !b.kantongTujuan) return true;
    return (b.kantong !== null && keluar) || (Boolean(b.kantongTujuan) && masukKe(b.kantongTujuan));
  });
  if (kandidat.length <= 1) return { kandidat, pasti: kandidat.length === 1 };

  const mb = menit(b.jam);
  const hariSama = (t: CalonLengkapi) => (t.transaction_date === b.tanggal ? 0 : 1);
  /** Baris rekening tanpa jam: jam gambar tidak bertentangan dengan jam baris sebelum & sesudahnya? */
  const muat = (t: CalonLengkapi) => {
    if (t.waktu || t.urut == null || !b.jam) return true;
    const jam = jamKe(b.jam)!;
    return (opsi.tetangga ?? [])
      .filter((x) => x.id !== t.id && x.kantong_id === t.kantong_id && x.transaction_date === t.transaction_date && x.waktu)
      .every((x) => (x.urut < t.urut! ? jamKe(x.waktu)! <= jam : jamKe(x.waktu)! >= jam));
  };
  const jarak = (t: CalonLengkapi) => (mb === null || !t.waktu ? null : Math.abs(menit(t.waktu)! - mb));
  const urutkan = (a: CalonLengkapi, c: CalonLengkapi) =>
    hariSama(a) - hariSama(c) ||
    (jarak(a) ?? 9999) - (jarak(c) ?? 9999) ||
    (a.urut ?? 9999) - (c.urut ?? 9999) ||
    String(a.transaction_date).localeCompare(String(c.transaction_date));

  // Yang masih mungkin: jamnya dekat, atau tanpa jam dan urutannya cocok.
  const mungkin = kandidat.filter((t) => (t.waktu ? mb !== null && jarak(t)! <= JAM_DEKAT : muat(t)));
  const sisa = kandidat.filter((t) => !mungkin.includes(t));
  const urut = [...mungkin].sort(urutkan);
  if (urut.length === 1) return { kandidat: [...urut, ...sisa.sort(urutkan)], pasti: true };
  // Satu-satunya yang jamnya dekat (yang lain tanpa jam atau jauh) juga pasti.
  const berjam = urut.filter((t) => t.waktu);
  if (berjam.length === 1 && urut.length === berjam.length) return { kandidat: [...urut, ...sisa.sort(urutkan)], pasti: true };
  // Beberapa baris rekening tanpa jam & beberapa gambar sebayar di hari itu:
  // gambar ke-k menurut jam = baris ke-k menurut urutan rekening koran.
  const p = opsi.peringkat;
  const tanpaJam = urut.filter((t) => !t.waktu && t.urut != null && t.transaction_date === b.tanggal);
  if (p && p.dari > 1 && tanpaJam.length === p.dari && tanpaJam.length === urut.length && p.ke >= 1 && p.ke <= p.dari) {
    const menurutBank = [...tanpaJam].sort((a, c) => a.urut! - c.urut!);
    const pilih = menurutBank[p.ke - 1];
    return { kandidat: [pilih, ...kandidat.filter((t) => t !== pilih).sort(urutkan)], pasti: true };
  }
  return { kandidat: [...urut, ...sisa.sort(urutkan)], pasti: false };
}

/**
 * Bukti untuk dicocokkan dari hasil baca AI. Kantong: sumber dana yang
 * terbaca; bila hanya e-wallet perantara/QRIS (atau tidak ada) → kantong mana
 * pun. Deposito tidak pernah jadi kantong sumber.
 */
export function buktiCocok(e: ExtractedReceipt, kantong: Pick<Kantong, "id" | "name" | "kind" | "aliases" | "macam_simpanan">[]): BuktiCocok {
  const uang = kantong.filter((k) => !kantongDeposito(k) && k.kind !== "orang");
  const perantara = (s: string | null | undefined) => Boolean(s) && (/^(qris|shopee ?pay|gopay|ovo|dana|linkaja|e-?wallet)$/i.test(s!.trim()) || (e.dompet && s!.trim().toLowerCase() === e.dompet.trim().toLowerCase()));
  let id: string | null = null;
  let tanpaKantong = false;
  if (e.sumber_dana && !e.paylater) {
    id = cocokkanKantong(e.sumber_dana, uang)?.id ?? null;
    // Sumber dana tertulis (mis. Saldo ShopeePay) tapi tidak ada kantongnya: bukan baris rekening koran mana pun.
    tanpaKantong = !id;
  } else if (e.payment_method && !perantara(e.payment_method)) {
    id = cocokkanKantong(e.payment_method, uang)?.id ?? null;
  }
  const tujuan = e.type === "transfer" && e.payment_target ? (cocokkanKantong(e.payment_target, uang)?.id ?? null) : null;
  if (tanpaKantong && tujuan) tanpaKantong = false;
  return {
    jenis: jenisBukti(e),
    type: e.type,
    nominal: e.amount,
    tanggal: e.transaction_date,
    jam: e.time,
    kantong: id,
    kantongTujuan: tujuan,
    tanpaKantong: tanpaKantong || Boolean(e.paylater),
  };
}

// ---------------------------------------------------------------- isian

/** Kolom transaksi yang boleh diubah oleh Lengkapi (dan dikembalikan oleh Urungkan). */
export const KOLOM_LENGKAPI = ["merchant", "waktu", "category", "kelompok", "description", "usulan_pecah", "ref_bukti", "perlu_dilengkapi"] as const;
export type KolomLengkapi = (typeof KOLOM_LENGKAPI)[number];
export type IsianLengkapi = Partial<Record<KolomLengkapi, string | boolean | null>>;

export interface TxDilengkapi {
  id: string;
  amount: number | string;
  type: string;
  category: string;
  merchant: string | null;
  description: string | null;
  waktu?: string | null;
  kelompok?: string | null;
  source: string;
  ref_bukti?: string | null;
  perlu_dilengkapi?: boolean | null;
  usulan_pecah?: string | null;
  /** Sudah dipecah (punya bagian pecahan): usulan pecah tidak ditawarkan lagi. */
  dipecah?: boolean;
}

/** Isi bukti yang dipakai untuk melengkapi. */
export interface IsiBukti {
  jenis: JenisBukti;
  type: string;
  merchant: string | null;
  jam: string | null;
  category: string;
  kelompok: string | null;
  description: string | null;
  usulan_pecah: BagianPecah[] | null;
  ref: string | null;
  sidik?: string | null;
  cashback: number | null;
  rekening_tujuan?: string | null;
}

export const isiDariEkstraksi = (e: ExtractedReceipt, sidik?: string | null): IsiBukti => ({
  jenis: jenisBukti(e),
  type: e.type,
  merchant: e.merchant,
  jam: e.time,
  category: e.category,
  kelompok: e.kelompok,
  description: e.description,
  usulan_pecah: e.usulan_pecah,
  ref: e.ref_bukti ?? null,
  sidik: sidik ?? null,
  cashback: e.type === "expense" ? e.cashback : null,
  rekening_tujuan: e.rekening_tujuan ?? null,
});

export interface HasilIsian {
  patch: IsianLengkapi;
  /** Nilai lama kolom yang diubah, untuk Urungkan. */
  sebelum: IsianLengkapi;
  /** "Merchant: ShopeePay → Alfamart", … */
  perubahan: string[];
  /** Kategori struk berbeda dengan kategori yang sudah diisi user: ditawarkan, tidak ditimpa (§2). */
  tawarKategori: { category: string; kelompok: string | null } | null;
}

/** Siapa yang mengisi merchant/keterangan sekarang: bank < screenshot < struk < user. */
function asalIsi(tx: TxDilengkapi): "bank" | JenisBukti | "user" {
  const t = bacaRef(tx.ref_bukti);
  if (t.some((x) => x.jenis === "struk") || tx.source === "receipt") return "struk";
  if (t.some((x) => x.jenis === "ss") || tx.source === "payment_proof") return "ss";
  return tx.source === "statement" ? "bank" : "user";
}
const PERINGKAT = { bank: 0, ss: 1, struk: 2, user: 3 } as const;

/**
 * Isian Lengkapi (§2): nominal, tanggal, kantong tidak pernah disentuh.
 *  - merchant & keterangan: diganti bila pengisinya sekarang lebih lemah
 *    (rekening koran < screenshot < struk < diketik user);
 *  - jam: hanya bila belum ada (jam bank tetap), dan `jamBoleh`;
 *  - kategori: menggantikan "Lainnya"; kategori lain dari struk hanya ditawarkan
 *    (`gantiKategori` = user menerima tawarannya);
 *  - usulan pecah dari struk, pengenal bukti, tanda Perlu dilengkapi hilang.
 * `paksa` (§4 "Lengkapi yang sudah ada"): merchant & keterangan dari gambar baru selalu dipakai.
 */
export function isianLengkapi(
  tx: TxDilengkapi,
  b: IsiBukti,
  opsi: { jamBoleh?: boolean; gantiKategori?: boolean; paksa?: boolean; nama?: (slug: string, type: string) => string } = {},
): HasilIsian {
  const patch: IsianLengkapi = {};
  const perubahan: string[] = [];
  const nama = opsi.nama ?? ((s: string) => s);
  const asal = asalIsi(tx);
  const lebihKuat = opsi.paksa || PERINGKAT[b.jenis] > PERINGKAT[asal];

  const merchant = b.merchant?.trim().slice(0, 100) || null;
  if (merchant && merchant !== tx.merchant && (lebihKuat || !tx.merchant)) {
    patch.merchant = merchant;
    perubahan.push(tx.merchant ? `Merchant: ${tx.merchant} → ${merchant}` : `Merchant: ${merchant}`);
  }
  if (b.jam && !tx.waktu && opsi.jamBoleh !== false) {
    patch.waktu = `${b.jam.slice(0, 5)}:00`;
    perubahan.push(`Jam ${b.jam.slice(0, 5).replace(":", ".")}`);
  }
  let tawarKategori: HasilIsian["tawarKategori"] = null;
  const kategoriCocok = b.type === tx.type && (tx.type === "expense" || tx.type === "income") && b.category && b.category !== "other";
  if (kategoriCocok && b.category !== tx.category) {
    if (tx.category === "other" || opsi.gantiKategori) {
      patch.category = b.category;
      patch.kelompok = tx.type === "expense" ? b.kelompok : null;
      perubahan.push(`Kategori: ${nama(tx.category, tx.type)} → ${nama(b.category, tx.type)}`);
    } else if (b.jenis === "struk") tawarKategori = { category: b.category, kelompok: b.kelompok };
  }
  const keterangan = (b.rekening_tujuan && merchant ? `Kirim ke ${merchant} · ${b.rekening_tujuan}` : b.description?.trim())?.slice(0, 500) || null;
  if (keterangan && keterangan !== tx.description && (lebihKuat || !tx.description)) {
    patch.description = keterangan;
    perubahan.push(`Keterangan: ${keterangan}`);
  }
  const usulan = b.jenis === "struk" && tx.type === "expense" && !tx.dipecah && Array.isArray(b.usulan_pecah) && b.usulan_pecah.length > 1 ? b.usulan_pecah : null;
  if (usulan && usulan.reduce((n, x) => n + x.amount, 0) === Number(tx.amount)) {
    patch.usulan_pecah = JSON.stringify(usulan);
    perubahan.push(`Isinya campur: bisa dipecah jadi ${usulan.length} bagian`);
  }
  const ref = tambahRef(tx.ref_bukti, b.jenis, b.ref, b.sidik);
  if (ref !== (tx.ref_bukti ?? "")) patch.ref_bukti = ref;
  const r = rapikanRef(b.ref);
  if (r) perubahan.push(`${b.jenis === "ss" ? "Order SN" : "Nomor bon"} ${r}`);
  if (tx.perlu_dilengkapi) patch.perlu_dilengkapi = false;
  if (b.cashback) perubahan.push(`Cashback ${fmtIDR(b.cashback)}`);

  const sebelum: IsianLengkapi = {};
  for (const k of Object.keys(patch) as KolomLengkapi[]) sebelum[k] = (tx as unknown as Record<string, string | boolean | null | undefined>)[k] ?? (k === "perlu_dilengkapi" ? false : null);
  return { patch, sebelum, perubahan, tawarKategori };
}

/** Kantong tempat cashback dikreditkan (K2): kantong e-wallet perantaranya, mis. ShopeePay. */
export function kantongCashback<K extends Pick<Kantong, "id" | "name" | "kind" | "aliases">>(dompet: string | null | undefined, kantong: K[]): K | null {
  return dompet ? cocokkanKantong(dompet, kantong.filter((k) => k.kind === "ewallet" || k.kind === "bank")) : null;
}

/** Ringkas satu transaksi untuk kartu: "ShopeePay · −Rp 32.500 · 3 Sep · SeaBank". */
export const labelTransaksi = (t: { merchant: string | null; amount: number | string; type: string; transaction_date: string; waktu?: string | null; payment_method?: string | null }, tanggal: (iso: string) => string) =>
  [
    t.merchant || "Tanpa nama",
    `${t.type === "expense" ? "−" : t.type === "income" ? "+" : ""}${fmtIDR(Number(t.amount))}`,
    `${tanggal(t.transaction_date)}${t.waktu ? ` ${t.waktu.slice(0, 5).replace(":", ".")}` : ""}`,
    t.payment_method,
  ]
    .filter(Boolean)
    .join(" · ");
