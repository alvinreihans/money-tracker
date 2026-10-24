import type { SupabaseClient } from "@supabase/supabase-js";
import { geserHari } from "@/lib/format";
import { bersihkanCari } from "@/lib/transaksi-input";

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
}

export const FILTER_KOSONG: FilterRiwayat = { jenis: "semua", q: "", periode: null, dari: null, sampai: null, kantong: [], kategori: [] };

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
  sah: { kantong: string[]; kategori: string[] },
): FilterRiwayat {
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
export const adaFilter = (f: FilterRiwayat) => Boolean(f.periode || f.dari || f.sampai || f.kantong.length || f.kategori.length);

/** Filter → alamat Riwayat. Tanpa filter = "/riwayat". */
export function alamatRiwayat(f: FilterRiwayat): string {
  const p = new URLSearchParams();
  if (f.jenis !== "semua") p.set("jenis", f.jenis);
  if (f.periode) p.set("periode", f.periode);
  if (!f.periode && f.dari) p.set("dari", f.dari);
  if (!f.periode && f.sampai) p.set("sampai", f.sampai);
  if (f.kantong.length) p.set("kantong", f.kantong.join(","));
  if (f.kategori.length) p.set("kategori", f.kategori.join(","));
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

  if (f.q) query = query.or(`merchant.ilike.%${f.q}%,description.ilike.%${f.q}%,payment_method.ilike.%${f.q}%`);

  return query;
}

export interface RingkasanRiwayat {
  keluar: number;
  masuk: number;
  /** "YYYY-MM" → total bulan itu. */
  perBulan: Record<string, { keluar: number; masuk: number }>;
}

/** Total keluar & masuk (keseluruhan dan per bulan). Pindah kantong tidak dihitung. */
export function ringkasRiwayat(baris: { amount: number | string; type: string; transaction_date: string }[]): RingkasanRiwayat {
  const r: RingkasanRiwayat = { keluar: 0, masuk: 0, perBulan: {} };
  for (const t of baris) {
    const arah = t.type === "expense" ? "keluar" : t.type === "income" ? "masuk" : null;
    if (!arah) continue;
    const n = Number(t.amount);
    const b = (r.perBulan[t.transaction_date.slice(0, 7)] ??= { keluar: 0, masuk: 0 });
    b[arah] += n;
    r[arah] += n;
  }
  return r;
}
