import { SchemaType, type FunctionDeclaration } from "@google/generative-ai";
import { geserHari } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";
import { cocokkanKantong, type Kantong } from "@/lib/kantong";
import { alamatRiwayat, bacaFilter, type FilterRiwayat } from "@/lib/riwayat";

/**
 * Tanya AI di Analitik (SPEC-analitik-ai): AI tidak menghitung sendiri, ia
 * memanggil fungsi kita. Di sini bagian murninya — deklarasi fungsi,
 * pembersih argumen dari AI, pemeriksa angka di jawaban, dan tautan telusur.
 * Diuji di scripts/uji-tanya.mts.
 */

export const NAMA_FUNGSI = ["ringkasan_bulan", "cari_transaksi", "saldo_kantong", "pinjaman_cicilan", "hitung"] as const;
export type NamaFungsi = (typeof NAMA_FUNGSI)[number];

export const DEKLARASI_FUNGSI: FunctionDeclaration[] = [
  {
    name: "ringkasan_bulan",
    description:
      "Ringkasan satu bulan dibanding bulan sebelumnya: total keluar & masuk, persen perubahan, pengeluaran per kategori, merchant teratas, hari paling boros, kategori yang paling naik, dan proyeksi akhir bulan (bulan berjalan).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { bulan: { type: SchemaType.STRING, description: "YYYY-MM" } },
      required: ["bulan"],
    },
  },
  {
    name: "cari_transaksi",
    description:
      "Cari transaksi dengan filter lalu dapatkan jumlahnya, total keluar & masuk, total per kategori, dan 10 transaksi terbesar. Pakai untuk pertanyaan seperti 'berapa total kopi bulan ini' atau 'belanja di Shopee minggu lalu'.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dari: { type: SchemaType.STRING, description: "Tanggal awal YYYY-MM-DD (inklusif). Kalau dari & sampai kosong, dipakai bulan yang sedang dilihat; untuk semua waktu isi 2000-01-01." },
        sampai: { type: SchemaType.STRING, description: "Tanggal akhir YYYY-MM-DD (inklusif)" },
        jenis: { type: SchemaType.STRING, format: "enum", enum: ["semua", "keluar", "masuk", "pindah"] },
        kategori: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Slug kategori milik pengguna" },
        kantong: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Nama kantong milik pengguna" },
        kata: { type: SchemaType.STRING, description: "Kata yang dicari di merchant/keterangan, mis. 'kopi'" },
        kecuali: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Kecualikan transaksi yang merchant/keterangannya memuat salah satu kata ini, mis. ['Laku6'] untuk 'kalau Laku6 tidak dihitung'",
        },
        minimal: { type: SchemaType.NUMBER, description: "Hanya transaksi dengan nominal >= ini" },
        maksimal: { type: SchemaType.NUMBER, description: "Hanya transaksi dengan nominal <= ini" },
      },
    },
  },
  {
    name: "saldo_kantong",
    description: "Saldo tiap kantong (bank, e-wallet, tunai, orang, kartu kredit) dan total aset.",
  },
  {
    name: "hitung",
    description:
      "Kalkulator: hitung ekspresi aritmetika (+ - * / dan kurung) dengan angka biasa tanpa titik ribuan, mis. '13356219 - 10300000' atau '(367000 / 8000000) * 100'. WAJIB dipakai untuk selisih, jumlah, rata-rata, atau persen yang tidak ada langsung di hasil fungsi lain. Angka >= 1000 harus berasal dari hasil fungsi sebelumnya.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        ekspresi: { type: SchemaType.STRING },
        keterangan: { type: SchemaType.STRING, description: "Apa yang dihitung, mis. 'pengeluaran tanpa Laku6'" },
      },
      required: ["ekspresi"],
    },
  },
  {
    name: "pinjaman_cicilan",
    description: "Siapa berutang ke pengguna, pengguna berutang ke siapa, tagihan kartu kredit, dan cicilan yang berjalan beserta jatuh tempo berikutnya.",
  },
];

export interface KonteksTanya {
  hariIni: string;
  kantong: Pick<Kantong, "id" | "name" | "aliases">[];
  kategori: { type: string; slug: string }[];
}

const bulanSah = (b: unknown, hariIni: string): b is string =>
  typeof b === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(b) && b <= hariIni.slice(0, 7);

/** Bulan dari AI; yang tidak sah jatuh ke bulan berjalan. */
export const bulanDariArgumen = (args: Record<string, unknown>, hariIni: string) => (bulanSah(args.bulan, hariIni) ? args.bulan : hariIni.slice(0, 7));

/**
 * Argumen cari_transaksi dari AI → filter Riwayat. Lewat bacaFilter yang
 * sama dengan URL, jadi kantong & kategori harus milik user dan tanggal
 * harus tanggal sungguhan. Kantong disebut AI dengan nama, dicocokkan ke id.
 */
export function filterDariArgumen(args: Record<string, unknown>, k: KonteksTanya): FilterRiwayat {
  const jenis = typeof args.jenis === "string" ? args.jenis : "semua";
  const arah = jenis === "keluar" ? ["expense"] : jenis === "masuk" ? ["income"] : ["expense", "income"];
  const daftar = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const kategori = daftar(args.kategori).flatMap((slug) => k.kategori.filter((c) => c.slug === slug && arah.includes(c.type)).map((c) => `${c.type}:${c.slug}`));
  const kantong = daftar(args.kantong)
    .map((nama) => cocokkanKantong(nama, k.kantong)?.id)
    .filter((id): id is string => Boolean(id));
  return bacaFilter(
    {
      jenis,
      dari: typeof args.dari === "string" ? args.dari : undefined,
      sampai: typeof args.sampai === "string" ? args.sampai : undefined,
      kantong: kantong.join(","),
      kategori: kategori.join(","),
      q: typeof args.kata === "string" ? args.kata : undefined,
    },
    { kantong: k.kantong.map((x) => x.id), kategori: k.kategori.map((c) => `${c.type}:${c.slug}`) },
  );
}

/** Tombol telusur untuk satu pemanggilan fungsi (kalkulator tidak punya tujuan). */
export function tautanDari(nama: NamaFungsi, args: Record<string, unknown>, k: KonteksTanya): { label: string; href: string } | null {
  if (nama === "hitung") return null;
  // Riwayat belum bisa mengecualikan atau membatasi nominal: tautannya menampilkan sebelum dikecualikan.
  const disaring = (Array.isArray(args.kecuali) && args.kecuali.length > 0) || args.minimal != null || args.maksimal != null;
  if (nama === "cari_transaksi") return { label: disaring ? "Lihat semua di Riwayat" : "Lihat di Riwayat", href: alamatRiwayat(filterDariArgumen(args, k)) };
  if (nama === "ringkasan_bulan") {
    const bulan = bulanDariArgumen(args, k.hariIni);
    const nama = new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(new Date(`${bulan}-01T00:00:00Z`));
    return { label: `Buka Analitik ${nama.charAt(0).toUpperCase()}${nama.slice(1)}`, href: bulan === k.hariIni.slice(0, 7) ? "/analitik" : `/analitik?bulan=${bulan}` };
  }
  if (nama === "saldo_kantong") return { label: "Lihat kantong", href: "/profil/kantong" };
  return { label: "Buka Lend & Borrow", href: "/pinjaman" };
}

/**
 * Nominal rupiah yang disebut di jawaban, beserta ketelitiannya: "Rp 60.000"
 * persis, "Rp 1,2 jt" ±0,05 jt, "Rp 450 rb" ±0,5 rb.
 */
export function rupiahDiJawaban(teks: string): { nilai: number; toleransi: number }[] {
  const hasil: { nilai: number; toleransi: number }[] = [];
  for (const m of teks.matchAll(/Rp\s?([\d.,]+)\s*(jt|juta|rb|ribu|M|miliar)?/gi)) {
    const satuan = m[2]?.toLowerCase();
    if (satuan) {
      const angka = Number(m[1].replace(/\./g, "").replace(",", "."));
      const kali = satuan === "jt" || satuan === "juta" ? 1e6 : satuan === "m" || satuan === "miliar" ? 1e9 : 1e3;
      const desimal = m[1].includes(",") ? m[1].split(",")[1].length : 0;
      if (Number.isFinite(angka)) hasil.push({ nilai: angka * kali, toleransi: (kali * 10 ** -desimal) / 2 });
    } else {
      const angka = Number(m[1].replace(/[.,]$/, "").replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(angka) && angka > 0) hasil.push({ nilai: angka, toleransi: 0.5 });
    }
  }
  return hasil;
}

/** Semua angka di hasil fungsi (rekursif). */
export function angkaDiData(data: unknown, kumpul: number[] = []): number[] {
  if (typeof data === "number") kumpul.push(Math.abs(data));
  else if (Array.isArray(data)) data.forEach((x) => angkaDiData(x, kumpul));
  else if (data && typeof data === "object") Object.values(data).forEach((x) => angkaDiData(x, kumpul));
  return kumpul;
}

/** Nominal di jawaban yang TIDAK ada di hasil fungsi — tanda AI mengarang/menghitung sendiri. */
export function rupiahTakTerverifikasi(jawaban: string, hasilFungsi: unknown[]): number[] {
  const data = angkaDiData(hasilFungsi);
  return rupiahDiJawaban(jawaban)
    .filter((r) => !data.some((d) => Math.abs(d - r.nilai) <= r.toleransi))
    .map((r) => r.nilai);
}

/** Rentang satu bulan "YYYY-MM" → [awal, akhir]. */
export const rentangBulan = (bulan: string) => [`${bulan}-01`, geserHari(`${geserBulan(bulan, 1)}-01`, -1)] as const;

/**
 * Kalkulator untuk AI (SPEC-analitik-ai): hanya angka, + - * / dan kurung —
 * diurai sendiri, tanpa eval. Angka >= 1000 harus sudah ada di hasil fungsi
 * sebelumnya (`data`), supaya kalkulator tidak jadi jalan untuk angka karangan;
 * angka kecil (hari, persen, pengali) boleh.
 */
export function hitungEkspresi(ekspresi: string, data: number[]): { hasil: number } | { error: string } {
  const teks = ekspresi.replace(/\s+/g, "");
  if (!teks || teks.length > 200 || !/^[\d.+\-*/()]+$/.test(teks)) return { error: "Ekspresi hanya boleh angka, + - * / dan kurung." };
  const asing = (teks.match(/\d+(\.\d+)?/g) ?? []).map(Number).filter((n) => n >= 1000 && !data.some((d) => Math.abs(d - n) < 0.5));
  if (asing.length) return { error: `Angka ${asing.join(", ")} tidak ada di hasil fungsi; ambil dulu lewat fungsi lain.` };

  let i = 0;
  const lihat = () => teks[i];
  // ekspresi := suku (('+'|'-') suku)* ; suku := faktor (('*'|'/') faktor)* ; faktor := angka | '(' ekspresi ')' | '-' faktor
  const ekspresiP = (): number => {
    let n = suku();
    while (lihat() === "+" || lihat() === "-") n = teks[i++] === "+" ? n + suku() : n - suku();
    return n;
  };
  const suku = (): number => {
    let n = faktor();
    while (lihat() === "*" || lihat() === "/") {
      const op = teks[i++];
      const b = faktor();
      if (op === "/" && b === 0) throw new Error("bagi nol");
      n = op === "*" ? n * b : n / b;
    }
    return n;
  };
  const faktor = (): number => {
    if (lihat() === "-") {
      i++;
      return -faktor();
    }
    if (lihat() === "(") {
      i++;
      const n = ekspresiP();
      if (teks[i++] !== ")") throw new Error("kurung");
      return n;
    }
    const m = teks.slice(i).match(/^\d+(\.\d+)?/);
    if (!m) throw new Error("angka");
    i += m[0].length;
    return Number(m[0]);
  };
  try {
    const n = ekspresiP();
    if (i !== teks.length || !Number.isFinite(n)) return { error: "Ekspresi tidak bisa dihitung." };
    return { hasil: Math.round(n * 100) / 100 };
  } catch (e) {
    return { error: e instanceof Error && e.message === "bagi nol" ? "Tidak bisa dibagi nol." : "Ekspresi tidak bisa dihitung." };
  }
}

/**
 * Argumen dari AI sebelum dipakai: cari_transaksi tanpa dari & sampai =
 * bulan yang sedang dilihat (bukan semua waktu) — tanpa ini "bulan ini"
 * yang lupa diberi tanggal diam-diam menjumlah semua bulan.
 */
export function lengkapiArgumen(nama: NamaFungsi, args: Record<string, unknown>, bulan: string): Record<string, unknown> {
  if (nama !== "cari_transaksi" || args.dari || args.sampai) return args;
  const [dari, sampai] = rentangBulan(bulan);
  return { ...args, dari, sampai };
}
