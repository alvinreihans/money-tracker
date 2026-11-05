import type { SupabaseClient } from "@supabase/supabase-js";
import { geserHari, isoLokal, kelompokWaktu } from "@/lib/format";
import { KELOMPOK, type Kelompok } from "@/lib/metode";
import { bersihkanCari } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

/**
 * Filter & query Riwayat (SPEC-riwayat-filter). Satu objek filter dipakai
 * daftar (server: 100 pertama, browser: "Muat lagi") dan total per bulan,
 * jadi keduanya tidak pernah berbeda. Semua filter tinggal di URL.
 */

export const JENIS_RIWAYAT = ["semua", "keluar", "masuk", "pindah"] as const;
export type JenisRiwayat = (typeof JENIS_RIWAYAT)[number];

/** Periode cepat — disimpan sebagai nama, jadi bookmark "Bulan ini" tetap bulan berjalan. */
export const PERIODE = [
  { id: "hari-ini", label: "Hari ini" },
  { id: "7-hari", label: "7 hari terakhir" },
  { id: "bulan-ini", label: "Bulan ini" },
  { id: "bulan-lalu", label: "Bulan lalu" },
] as const;
export type Periode = (typeof PERIODE)[number]["id"];

export interface FilterRiwayat {
  jenis: JenisRiwayat;
  q: string;
  periode: Periode | null;
  /** "Pilih rentang": YYYY-MM-DD, hanya kalau periode kosong. */
  dari: string | null;
  sampai: string | null;
  /** id kantong; cocok sebagai asal ATAU tujuan. */
  kantong: string[];
  /** "expense:food" / "income:salary" — slug sama bisa ada di kedua jenis. */
  kategori: string[];
  /** Kelompok budgeting (SPEC-metode-budget): kelompok yang berlaku tiap pengeluaran. */
  kelompok: Kelompok[];
  /** Nama merchant persis, tanpa beda huruf/spasi (tautan merchant Analitik); "" = semua. */
  merchant: string;
  /** "tanpa": sembunyikan pengeluaran yang dibayar dari tujuan tabungan, seperti Analitik (SPEC-analitik-tujuan). */
  tujuan: "tanpa" | null;
  /** id kantong tujuan tabungan milik user (diisi bacaFilter; tidak ditulis ke URL). */
  idTujuan: string[];
}

export const FILTER_KOSONG: FilterRiwayat = {
  jenis: "semua",
  q: "",
  periode: null,
  dari: null,
  sampai: null,
  kantong: [],
  kategori: [],
  kelompok: [],
  merchant: "",
  tujuan: null,
  idTujuan: [],
};

/** Merchant dari URL: spasi dirapikan seperti penggabungan merchant Analitik, maks 100 huruf. */
export const bersihkanMerchant = (v: string | undefined) =>
  (v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100)
    .trim();

/**
 * Pola regex Postgres (`~*`) untuk merchant persis: tanpa beda huruf, spasi
 * tepi diabaikan, spasi di antara kata berapa pun — sama dengan Analitik yang
 * menggabung merchant lewat `trim().replace(/\s+/g, " ").toLowerCase()`.
 */
export const polaMerchant = (nama: string) =>
  `^\\s*${bersihkanMerchant(nama)
    .split(" ")
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+")}\\s*$`;

/** Versi JS polaMerchant (untuk kartu yang sudah dimuat & uji). */
export const cocokMerchant = (merchant: string | null | undefined, nama: string) =>
  Boolean(merchant) && bersihkanMerchant(merchant!).toLowerCase() === bersihkanMerchant(nama).toLowerCase();

/** Jumlah baris per muat. */
export const PER_MUAT = 100;

/** Batas jumlah nilai per filter di URL (masukan tidak tepercaya). */
const MAKS_NILAI = 50;

const tanggalSah = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

const satu = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const daftar = (v: string | string[] | undefined, sah: string[]) =>
  [...new Set((satu(v) ?? "").split(",").filter((x) => sah.includes(x)))].slice(0, MAKS_NILAI);

/**
 * Parameter URL → filter. Nilai yang tidak dikenal dibuang: kantong dan
 * kategori harus milik user (`sah`), tanggal harus tanggal sungguhan.
 */
export function bacaFilter(
  p: Record<string, string | string[] | undefined>,
  sah: { kantong: string[]; kategori: string[]; tujuan?: string[] },
): FilterRiwayat {
  const tujuan = satu(p.tujuan) === "tanpa" ? "tanpa" : null;
  const jenis = JENIS_RIWAYAT.find((j) => j === satu(p.jenis)) ?? "semua";
  const periode = PERIODE.find((x) => x.id === satu(p.periode))?.id ?? null;
  let dari = !periode && tanggalSah(satu(p.dari)) ? satu(p.dari)! : null;
  let sampai = !periode && tanggalSah(satu(p.sampai)) ? satu(p.sampai)! : null;
  if (dari && sampai && dari > sampai) [dari, sampai] = [sampai, dari];
  return {
    jenis,
    q: bersihkanCari(satu(p.q)),
    periode,
    dari,
    sampai,
    kantong: daftar(p.kantong, sah.kantong),
    kategori: daftar(p.kategori, sah.kategori),
    kelompok: daftar(p.kelompok, [...KELOMPOK]) as Kelompok[],
    merchant: bersihkanMerchant(satu(p.merchant)),
    tujuan,
    idTujuan: tujuan ? [...new Set(sah.tujuan ?? [])] : [],
  };
}

const akhirBulan = (iso: string) => {
  const [t, b] = iso.split("-").map(Number);
  return new Date(Date.UTC(t, b, 0)).toISOString().slice(0, 10);
};

/** Rentang tanggal (inklusif) dari periode atau "Pilih rentang", menurut hari ini (WIB). */
export function rentangTanggal(f: Pick<FilterRiwayat, "periode" | "dari" | "sampai">, hariIni: string): { dari: string | null; sampai: string | null } {
  const awalBulan = `${hariIni.slice(0, 7)}-01`;
  switch (f.periode) {
    case "hari-ini":
      return { dari: hariIni, sampai: hariIni };
    case "7-hari":
      return { dari: geserHari(hariIni, -6), sampai: hariIni };
    case "bulan-ini":
      return { dari: awalBulan, sampai: akhirBulan(awalBulan) };
    case "bulan-lalu": {
      const akhirLalu = geserHari(awalBulan, -1);
      return { dari: `${akhirLalu.slice(0, 7)}-01`, sampai: akhirLalu };
    }
    default:
      return { dari: f.dari, sampai: f.sampai };
  }
}

/** Filter selain jenis & cari yang sedang aktif (untuk chip Reset). */
export const adaFilter = (f: FilterRiwayat) =>
  Boolean(f.periode || f.dari || f.sampai || f.kantong.length || f.kategori.length || f.kelompok.length || f.merchant || f.tujuan);

/** Filter → alamat Riwayat. Tanpa filter = "/riwayat". */
export function alamatRiwayat(f: FilterRiwayat): string {
  const p = new URLSearchParams();
  if (f.jenis !== "semua") p.set("jenis", f.jenis);
  if (f.periode) p.set("periode", f.periode);
  if (!f.periode && f.dari) p.set("dari", f.dari);
  if (!f.periode && f.sampai) p.set("sampai", f.sampai);
  if (f.kantong.length) p.set("kantong", f.kantong.join(","));
  if (f.kategori.length) p.set("kategori", f.kategori.join(","));
  if (f.kelompok.length) p.set("kelompok", f.kelompok.join(","));
  if (f.merchant) p.set("merchant", f.merchant);
  if (f.tujuan) p.set("tujuan", f.tujuan);
  if (f.q) p.set("q", f.q);
  const qs = p.toString().replaceAll("%2C", ",").replaceAll("%3A", ":");
  return qs ? `/riwayat?${qs}` : "/riwayat";
}

/**
 * Transaksi untuk filter ini, terbaru dulu, beserta jumlah sebenarnya
 * (`count`). Tambahkan `.range()` untuk memilih halaman.
 */
export function queryRiwayat(supabase: SupabaseClient, f: FilterRiwayat, hariIni: string, kolom = "*") {
  let query = supabase
    .from("transactions")
    .select(kolom, { count: "exact" })
    // Yang belum selesai tidak di Riwayat; ada di lembar Catat (SPEC-catat-chat).
    .eq("status", "confirmed")
    .order("transaction_date", { ascending: false })
    .order("waktu", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    // Cashback/biaya admin berwaktu catat sama dengan induknya: induk dulu, ikutan tepat di bawahnya.
    .order("induk_id", { ascending: true, nullsFirst: true })
    // Pemecah seri: tanpa ini, baris bertanggal & waktu catat sama bisa
    // terlewat atau dobel di antara dua halaman.
    .order("id", { ascending: false });

  if (f.jenis === "keluar") query = query.eq("type", "expense");
  else if (f.jenis === "masuk") query = query.eq("type", "income");
  else if (f.jenis === "pindah") query = query.eq("type", "transfer");

  const { dari, sampai } = rentangTanggal(f, hariIni);
  if (dari) query = query.gte("transaction_date", dari);
  if (sampai) query = query.lte("transaction_date", sampai);

  // id & slug sudah divalidasi bacaFilter (milik user), aman dirangkai ke filter.
  if (f.kantong.length) {
    const ids = f.kantong.join(",");
    query = query.or(`kantong_id.in.(${ids}),kantong_tujuan_id.in.(${ids})`);
  }
  if (f.kategori.length) {
    const perJenis = (jenis: string) => f.kategori.filter((k) => k.startsWith(`${jenis}:`)).map((k) => k.slice(jenis.length + 1));
    const bagian = (["expense", "income"] as const)
      .map((j) => [j, perJenis(j)] as const)
      .filter(([, slug]) => slug.length)
      .map(([j, slug]) => `and(type.eq.${j},category.in.(${slug.join(",")}))`);
    query = query.or(bagian.join(","));
  }

  // Hanya pengeluaran yang berkelompok; nilainya sudah divalidasi bacaFilter.
  if (f.kelompok.length) query = query.in("kelompok_efektif", f.kelompok);

  // Merchant persis (tautan merchant Analitik): regex tanpa beda huruf, bukan ilike substring.
  if (f.merchant) query = query.filter("merchant", "imatch", polaMerchant(f.merchant));

  // Pengeluaran dari tujuan tabungan disembunyikan, aturannya sama dengan pisahTujuan (Analitik).
  // id sudah divalidasi bacaFilter (kantong tujuan milik user).
  if (f.tujuan && f.idTujuan.length) query = query.or(`type.neq.expense,kantong_id.is.null,kantong_id.not.in.(${f.idTujuan.join(",")})`);

  if (f.q) query = query.or(`merchant.ilike.%${f.q}%,description.ilike.%${f.q}%,payment_method.ilike.%${f.q}%`);

  return query;
}

export interface RingkasanRiwayat {
  keluar: number;
  masuk: number;
  /** "YYYY-MM" → total bulan itu. */
  perBulan: Record<string, { keluar: number; masuk: number }>;
  /** "YYYY-MM-DD" → total hari itu. */
  perHari: Record<string, { keluar: number; masuk: number }>;
  /** Jumlah transaksi: bagian dari transaksi yang dipecah dihitung satu (per `pecahan_dari ?? id`). */
  jumlah: number;
}

/** Kunci transaksi asli: bagian pecahan → id aslinya. */
const akarDari = (t: { id?: string; pecahan_dari?: string | null }) => t.pecahan_dari ?? t.id;

/**
 * Total keluar & masuk (keseluruhan, per bulan, per hari) dan jumlah
 * transaksi. Pindah kantong tidak dihitung di total.
 */
export function ringkasRiwayat(
  baris: { id?: string; pecahan_dari?: string | null; amount: number | string; type: string; transaction_date: string }[],
): RingkasanRiwayat {
  const r: RingkasanRiwayat = { keluar: 0, masuk: 0, perBulan: {}, perHari: {}, jumlah: 0 };
  const akar = new Set<string>();
  for (const t of baris) {
    const k = akarDari(t);
    if (k === undefined || !akar.has(k)) r.jumlah++;
    if (k !== undefined) akar.add(k);
    const arah = t.type === "expense" ? "keluar" : t.type === "income" ? "masuk" : null;
    if (!arah) continue;
    const n = Number(t.amount);
    const b = (r.perBulan[t.transaction_date.slice(0, 7)] ??= { keluar: 0, masuk: 0 });
    b[arah] += n;
    (r.perHari[t.transaction_date] ??= { keluar: 0, masuk: 0 })[arah] += n;
    r[arah] += n;
  }
  return r;
}

/**
 * Satu transaksi beserta biaya admin / cashback yang menempel padanya: halaman
 * detail (server) dan panel detail Riwayat di layar lebar (browser). RLS
 * membatasi ke baris milik user, jadi null = tidak ada atau bukan miliknya.
 */
export async function ambilDetail(supabase: SupabaseClient, id: string) {
  const { data: dibuka } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (!dibuka) return null;
  // Bagian dari transaksi yang dipecah (SPEC-metode-budget): yang dibuka
  // selalu transaksi aslinya, lengkap dengan semua bagiannya.
  const asliId = (dibuka.pecahan_dari as string | null) ?? id;
  const [{ data: asli }, { data: ikutan }, { data: bagian }] = await Promise.all([
    asliId === id ? Promise.resolve({ data: dibuka }) : supabase.from("transactions").select("*").eq("id", asliId).maybeSingle(),
    supabase.from("transactions").select("id, amount").eq("induk_id", asliId).limit(1).maybeSingle(),
    supabase.from("transactions").select("*").eq("pecahan_dari", asliId).order("amount", { ascending: false }),
  ]);
  if (!asli) return null;
  return {
    t: asli as Transaction,
    ikutan: ikutan ? { id: ikutan.id as string, amount: Number(ikutan.amount) } : null,
    bagian: (bagian ?? []) as Transaction[],
  };
}

/** Transaksi yang dipecah: total & jumlah bagiannya, per id transaksi asli. */
export type InfoPecahan = Record<string, { total: number; jumlah: number }>;

/**
 * Info pecahan untuk baris yang tampil (SPEC-metode-budget): transaksi yang
 * dipecah tampil satu kartu, dan kartu yang hanya memuat sebagian bagiannya
 * (karena filter) diberi tanda "Bagian dari Rp X". Satu query untuk semua.
 */
export async function infoPecahan(supabase: SupabaseClient, baris: Pick<Transaction, "id" | "pecahan_dari">[]): Promise<InfoPecahan> {
  const akar = [...new Set(baris.map((t) => t.pecahan_dari ?? t.id))];
  if (!akar.length) return {};
  const daftar = akar.join(",");
  const { data } = await supabase.from("transactions").select("id, amount, pecahan_dari").or(`id.in.(${daftar}),pecahan_dari.in.(${daftar})`);
  const info: InfoPecahan = {};
  for (const r of (data ?? []) as { id: string; amount: number | string; pecahan_dari: string | null }[]) {
    const k = r.pecahan_dari ?? r.id;
    info[k] = { total: (info[k]?.total ?? 0) + Number(r.amount), jumlah: (info[k]?.jumlah ?? 0) + 1 };
  }
  // Yang tidak dipecah tidak perlu dicatat.
  return Object.fromEntries(Object.entries(info).filter(([, v]) => v.jumlah > 1));
}

/**
 * Satu halaman (server: 100 pertama; "Muat lagi") tanpa memisahkan bagian
 * pecahan dari aslinya. Bagiannya berurutan tepat di sebelah aslinya karena
 * tanggal, jam, dan waktu catatnya sama. Halaman penuh yang diakhiri
 * transaksi yang dipecah (`pecahan`, infoPecahan halaman ini): transaksi itu
 * ditunda utuh ke halaman berikutnya, kecuali seluruh halaman satu transaksi.
 * Halaman berikutnya mulai dari jumlah baris yang dikembalikan di sini.
 */
export function potongHalaman<T extends { id: string; pecahan_dari?: string | null }>(baris: T[], perMuat: number, pecahan: InfoPecahan): T[] {
  if (baris.length < perMuat) return baris;
  const akhir = akarDari(baris[baris.length - 1]);
  if (!akhir || !pecahan[akhir]) return baris;
  let i = baris.length;
  while (i > 0 && akarDari(baris[i - 1]) === akhir) i--;
  return i === 0 ? baris : baris.slice(0, i);
}

/** Satu kartu daftar: satu transaksi, atau bagian-bagiannya yang cocok filter. */
export interface KartuRiwayat {
  /** Wakil kartu: baris asli bila ikut tampil, selain itu bagian pertama. */
  t: Transaction;
  /** Baris yang cocok filter (asli dan/atau bagian), urut seperti daftar. */
  baris: Transaction[];
  /** Jumlah nominal baris yang tampil = yang dihitung total hari/bulan. */
  nominal: number;
  /** Semua bagian transaksi yang dipecah tampil: kartu = transaksi utuh ("N bagian"). */
  penuh: boolean;
}

/**
 * Baris → kartu (SPEC-metode-budget). Transaksi yang dipecah selalu satu
 * kartu di posisi baris pertamanya. Kalau semua bagiannya tampil, kartu =
 * transaksi utuh; kalau hanya sebagian yang cocok filter, kartu hanya
 * menjumlah bagian itu ("Bagian dari Rp X"), jadi total hari/bulan = jumlah
 * kartu yang tampil.
 */
export function susunKartu(items: Transaction[], pecahan: InfoPecahan): KartuRiwayat[] {
  const perAkar = new Map<string, KartuRiwayat>();
  const kartu: KartuRiwayat[] = [];
  for (const t of items) {
    const k = t.pecahan_dari ?? t.id;
    const ada = perAkar.get(k);
    if (ada) {
      ada.baris.push(t);
      if (!t.pecahan_dari) ada.t = t;
    } else {
      const baru = { t, baris: [t], nominal: 0, penuh: false };
      perAkar.set(k, baru);
      kartu.push(baru);
    }
  }
  for (const c of kartu) {
    c.nominal = c.baris.reduce((n, t) => n + Number(t.amount), 0);
    const info = pecahan[c.t.pecahan_dari ?? c.t.id];
    c.penuh = Boolean(info) && c.baris.length >= info.jumlah;
  }
  return kartu;
}

/**
 * Tanggal pertama kelompok waktu Beranda (kelompokWaktu: "Hari ini",
 * "Minggu ini", nama bulan, tahun) tempat `iso` berada.
 */
export function awalKelompokWaktu(iso: string, sekarang = new Date()): string {
  const k = kelompokWaktu(iso, sekarang);
  const hariIni = isoLokal(sekarang);
  const hariKe = new Date(`${hariIni}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  const calon = [`${iso.slice(0, 4)}-01-01`, `${iso.slice(0, 7)}-01`, geserHari(hariIni, -((hariKe + 6) % 7)), geserHari(hariIni, 1)];
  return calon.filter((c) => c <= iso).sort().find((c) => kelompokWaktu(c, sekarang) === k) ?? iso;
}

/** Total pengeluaran per kelompok waktu Beranda dari baris pengeluaran terkonfirmasi. */
export function totalKelompokWaktu(baris: { amount: number | string; transaction_date: string }[], sekarang = new Date()): Record<string, number> {
  const total: Record<string, number> = {};
  for (const t of baris) {
    const k = kelompokWaktu(t.transaction_date, sekarang);
    total[k] = (total[k] ?? 0) + Number(t.amount);
  }
  return total;
}
