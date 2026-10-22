import type { TransactionType } from "@/types/transaction";

/** Formatter tampilan, dipakai bersama daftar dan halaman detail. */

export const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * Nominal untuk stat tile. Ringkas hanya kalau memang besar — "Rp 34 rb"
 * malah lebih sulit dibaca sekilas daripada "Rp 34.000".
 */
export const fmtIDRRingkas = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n)
    : fmtIDR(n);

/**
 * Semua hitungan "hari ini" memakai WIB, bukan zona waktu mesin. Server Vercel
 * berjalan di UTC: dengan zona mesin, dari jam 00.00 sampai 07.00 WIB server
 * mengira masih kemarin — label "Hari ini" meleset dan batas bulan bergeser
 * pada tanggal 1. Zona tetap juga membuat render server dan HP selalu sama.
 */
const ZONA = "Asia/Jakarta";

/** Tanggal WIB sebagai YYYY-MM-DD. toISOString() menggeser hari ke UTC. */
export const isoLokal = (d: Date) =>
  // en-CA kebetulan memformat tanggal persis YYYY-MM-DD.
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);

/** Geser tanggal YYYY-MM-DD sejumlah hari (boleh negatif). */
export const geserHari = (iso: string, hari: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
};

/** Nama bulan dari tanggal YYYY-MM-DD, mis. "Oktober". */
export const namaBulan = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 7)}-01T00:00:00Z`),
  );

/**
 * Kelompok waktu untuk subheader daftar, ala Voice Recorder Samsung: makin
 * jauh ke belakang, makin kasar — "Hari ini", "Kemarin", "Minggu ini" (sejak
 * Senin), nama bulan untuk tahun berjalan, lalu tahun.
 */
export const kelompokWaktu = (iso: string, sekarang = new Date()) => {
  const hariIni = isoLokal(sekarang);
  if (iso > hariIni) return "Mendatang";
  if (iso === hariIni) return "Hari ini";
  if (iso === geserHari(hariIni, -1)) return "Kemarin";

  const hariKe = new Date(`${hariIni}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  const senin = geserHari(hariIni, -((hariKe + 6) % 7));
  if (iso >= senin) return "Minggu ini";

  if (iso.slice(0, 4) === hariIni.slice(0, 4)) {
    const bulan = namaBulan(iso);
    return bulan.charAt(0).toUpperCase() + bulan.slice(1);
  }
  return iso.slice(0, 4);
};

export const fmtTanggal = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));

export const fmtWaktu = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA,
  }).format(new Date(iso));

/** Nama jenis transaksi dalam bahasa user. */
export const JENIS: Record<TransactionType, string> = {
  expense: "Keluar",
  income: "Masuk",
  transfer: "Pindah kantong",
};

/**
 * Alamat detail transaksi, membawa halaman asalnya (`kembali`) supaya tombol
 * kembali dan hapus mendarat di tempat yang sama — Beranda, atau Riwayat
 * lengkap dengan filter dan pencariannya.
 */
export const alamatDetail = (id: string, kembali?: string) =>
  kembali ? `/transactions/${id}?kembali=${encodeURIComponent(kembali)}` : `/transactions/${id}`;

/**
 * Alamat tujuan dari URL (?lanjut=, ?kembali=, ?next=) yang aman diikuti:
 * hanya alamat di dalam aplikasi ("/…"). "//situs-lain", "/\\situs-lain",
 * URL penuh, atau "@situs-lain" (yang menempel ke origin jadi
 * https://app@situs-lain) jatuh ke `cadangan` — mencegah open redirect.
 */
export function alamatInternal(teks: string | null | undefined, cadangan: string): string {
  return teks && /^\/(?![/\\])/.test(teks) ? teks : cadangan;
}

/** Halaman asal untuk tombol kembali & setelah hapus; bukan detail transaksi lain. */
export function tujuanKembali(kembali: string | undefined): string {
  return kembali?.startsWith("/transactions") ? "/riwayat" : alamatInternal(kembali, "/riwayat");
}

// Nama & ikon kategori: lib/kategori.ts (milik user, dari database).

/** Dari mana transaksi ini masuk — dijelaskan dengan bahasa user, bukan slug. */
export const SOURCE_LABEL: Record<string, string> = {
  receipt: "Foto struk",
  payment_proof: "Bukti pembayaran",
  statement: "Rekening koran",
  text: "Diketik",
};

export const labelSumber = (slug: string) => SOURCE_LABEL[slug] ?? slug;

/**
 * Isian nominal menyimpan angka mentah ("1500000") tapi menampilkan pemisah
 * ribuan ("1.500.000") — salah ketik satu nol jadi kelihatan. Rupiah tanpa sen:
 * selain angka dibuang, nol di depan dibuang, minus hanya di depan bila boleh.
 */
export function angkaMentah(teks: string, bolehMinus = false): string {
  const minus = bolehMinus && teks.trim().startsWith("-");
  return (minus ? "-" : "") + teks.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function angkaRibuan(mentah: string): string {
  const minus = mentah.startsWith("-");
  return (minus ? "-" : "") + mentah.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Nominal dari database ke isian: rupiah bulat, tanpa ".00". */
export const isianNominal = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "" : String(Math.round(Number(n)));
