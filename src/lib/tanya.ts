import { SchemaType, type FunctionDeclaration, type FunctionDeclarationSchemaProperty } from "@google/generative-ai";
import { fmtTanggalPanjang, geserHari } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";
import { cocokkanKantong, type Kantong } from "@/lib/kantong";
import { KELOMPOK } from "@/lib/metode";
import { kantongUang } from "@/lib/pinjaman";
import { alamatRiwayat, bacaFilter, type FilterRiwayat } from "@/lib/riwayat";
import { menungguCek, NAMA_PERPANJANGAN, periodeAktif, type Deposito, type PeriodeDeposito } from "@/lib/simpanan";
import { JENIS_KEJANGGALAN, type JenisKejanggalan } from "@/lib/periksa";
import { bersihkanCari } from "@/lib/transaksi-input";

/** Alat `cari` (SPEC-asisten-agen §2): sumber, kelompok, urutan, dan asal catatan → kolom source. */
export const SUMBER_CARI = ["transaksi", "kantong", "simpanan", "deposito", "cicilan", "pinjaman", "tujuan", "impor"] as const;
export const KELOMPOK_CARI = ["kantong", "kategori", "bulan", "merchant", "jenis", "status", "asal"] as const;
export const URUT_CARI = ["terbaru", "terlama", "terbesar", "terkecil"] as const;
export const ASAL_CARI: Record<string, string> = { rekening_koran: "statement", ketikan: "text", struk: "receipt", bukti_bayar: "payment_proof" };
/** Baris rinci paling banyak per pemanggilan (SPEC-asisten-agen §2). */
export const MAKS_RINCI = 50;

/**
 * Tanya AI di Analitik (SPEC-analitik-ai): AI tidak menghitung sendiri, ia
 * memanggil fungsi kita. Di sini bagian murninya — deklarasi fungsi,
 * pembersih argumen dari AI, pemeriksa angka di jawaban, dan tautan telusur.
 * Diuji di scripts/uji-tanya.mts.
 */

export const NAMA_FUNGSI = [
  "ringkasan_bulan",
  "cari_transaksi",
  "saldo_kantong",
  "pinjaman_cicilan",
  "hitung",
  "usul_ubah_kategori",
  // Asisten agen tahap A (SPEC-asisten-agen §2): alat baca yang lebar.
  "cari",
  "detail",
  "periksa_saldo",
  "cari_kejanggalan",
  // Asisten agen tahap B (SPEC-asisten-agen §3): alat ubah, hasilnya kartu usulan (Terapkan).
  "usul_buat_kantong",
  "usul_jadikan_pindah",
  "usul_ubah_transaksi",
  "usul_hapus",
  "usul_selesaikan_draft",
  "usul_catat",
  // Hanya untuk model ringan (lapis 2): menyerahkan ke model besar.
  "serahkan",
] as const;
export type NamaFungsi = (typeof NAMA_FUNGSI)[number];

/** Saringan transaksi bersama (`cari` dan alat usul_*). */
const SKEMA_SARING: FunctionDeclarationSchemaProperty = {
    type: SchemaType.OBJECT,
    description: "Saringan (semua opsional)",
    properties: {
      dari: { type: SchemaType.STRING, description: "Tanggal awal YYYY-MM-DD (inklusif)" },
      sampai: { type: SchemaType.STRING, description: "Tanggal akhir YYYY-MM-DD (inklusif)" },
      kantong: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Nama kantong (asal ATAU tujuan)" },
      jenis: { type: SchemaType.STRING, format: "enum", enum: ["keluar", "masuk", "pindah"] },
      kategori: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Slug kategori" },
      status: { type: SchemaType.STRING, format: "enum", enum: ["semua", "tercatat", "draft", "perlu_dilengkapi"], description: "Bawaan semua" },
      asal: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING, format: "enum", enum: Object.keys(ASAL_CARI) },
        description: "Asal catatan",
      },
      minimal: { type: SchemaType.NUMBER },
      maksimal: { type: SchemaType.NUMBER },
      kata: { type: SchemaType.STRING, description: "Kata di merchant/keterangan/nama, mis. 'DANA' atau 'top up'" },
      ref_bank: { type: SchemaType.STRING, format: "enum", enum: ["ada", "tidak"], description: "Punya baris rekening koran (ada) atau tidak" },
    },
  };

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
        merchant: { type: SchemaType.STRING, description: "Nama merchant persis bila pengguna menanyakan satu merchant, mis. 'Kopi Kenangan' (bukan untuk kata umum seperti 'kopi')" },
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
    description:
      "Saldo tiap kantong (bank, e-wallet, tunai, orang, kartu kredit, simpanan seperti deposito & pocket di dalam bank), isi tiap tujuan tabungan (mis. dana darurat) beserta targetnya, bunga & jatuh tempo deposito, dan total aset. Saldo kantong yang berisi simpanan/tujuan sudah gabungan (sama dengan aplikasi bank); saldo_sendiri = di luar isinya.",
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
    name: "usul_ubah_kategori",
    description:
      "HANYA saat pengguna meminta membetulkan/mengganti kategori transaksi dari satu merchant (mis. 'waitenjoy itu laundry', 'transfer ke Dnid Ridx Dana itu makan'). Mencari transaksinya dan menyiapkan USULAN; belum mengubah apa pun — pengguna yang menekan tombol Ubah.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        merchant: { type: SchemaType.STRING, description: "Nama merchant/penerima seperti yang disebut pengguna" },
        kategori: { type: SchemaType.STRING, description: "Slug atau nama kategori tujuan; boleh nama kategori yang belum ada (mis. 'Laundry')" },
        kelompok: {
          type: SchemaType.STRING,
          format: "enum",
          enum: [...KELOMPOK],
          description: "Hanya untuk kategori pengeluaran yang belum ada: kelompok budgeting-nya (laundry → kebutuhan)",
        },
      },
      required: ["merchant", "kategori"],
    },
  },
  {
    name: "pinjaman_cicilan",
    description: "Siapa berutang ke pengguna, pengguna berutang ke siapa, tagihan kartu kredit, cicilan yang berjalan beserta jatuh tempo berikutnya, bunganya, dan strategi pelunasan (Snowball/Avalanche): utang mana yang dilunasi dulu.",
  },
  {
    name: "cari",
    description:
      "Cari & jumlahkan data pengguna dari satu sumber: transaksi (SEMUA status: tercatat, draft, perlu dilengkapi), kantong, simpanan, deposito (+ periode), cicilan, pinjaman, tujuan, impor (riwayat impor rekening koran per kantong & bulan, dengan saldo bank terakhir). Bisa disaring, dikelompokkan & dijumlah, diurutkan. Mengembalikan paling banyak 50 baris rinci (dengan id untuk 'detail') dan ringkasan sisanya.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        sumber: { type: SchemaType.STRING, format: "enum", enum: [...SUMBER_CARI] },
        saring: SKEMA_SARING,
        kelompokkan: { type: SchemaType.STRING, format: "enum", enum: [...KELOMPOK_CARI], description: "Hanya untuk transaksi: jumlahkan per kelompok" },
        urutkan: { type: SchemaType.STRING, format: "enum", enum: [...URUT_CARI] },
        batas: { type: SchemaType.NUMBER, description: "Jumlah baris rinci, 1–50 (bawaan 20)" },
      },
      required: ["sumber"],
    },
  },
  {
    name: "detail",
    description:
      "Rincian lengkap satu transaksi/draft (id dari hasil 'cari', 'periksa_saldo', atau 'cari_kejanggalan'): ikutan (biaya/cashback), pasangan pindah kantong, induk/pecahan, asal (baris rekening koran beserta saldo bank, gambar), dan 'Cara dicatat' (teks/hasil baca AI, tanya-jawab). Bisa juga id kantong.",
    parameters: { type: SchemaType.OBJECT, properties: { id: { type: SchemaType.STRING } }, required: ["id"] },
  },
  {
    name: "periksa_saldo",
    description:
      "Dihitung kode: saldo aplikasi satu kantong vs saldo bank (dari baris rekening koran terakhir, atau saldo_bank yang disebut pengguna), selisihnya, dan calon penyebab (dobel, pindah kantong yang tercatat sebagai keluar+masuk, pengeluaran yang tampaknya pindah ke rekening sendiri, pindah kantong tanpa baris bank, transaksi sesudah rekening koran, draft). Pakai untuk 'kok saldo X beda sama bank', 'saldo X salah'.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        kantong: { type: SchemaType.STRING, description: "Nama kantong" },
        sampai: { type: SchemaType.STRING, description: "Bandingkan pada akhir tanggal ini YYYY-MM-DD (opsional)" },
        saldo_bank: { type: SchemaType.NUMBER, description: "Saldo menurut bank/aplikasi e-wallet yang DISEBUT pengguna (opsional)" },
      },
      required: ["kantong"],
    },
  },
  {
    name: "cari_kejanggalan",
    description:
      "Daftar yang perlu dirapikan: transaksi perlu dilengkapi, draft tertahan, calon dobel, top up e-wallet/bank yang kantongnya belum ada (tercatat sebagai pengeluaran), dan pindah kantong yang tercatat sebagai keluar+masuk terpisah.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { jenis: { type: SchemaType.STRING, format: "enum", enum: ["semua", ...JENIS_KEJANGGALAN] } },
    },
  },
  {
    name: "usul_buat_kantong",
    description:
      "USULAN membuat kantong baru (bank, e-wallet, tunai). Belum membuat apa pun: pengguna menekan Terapkan di kartu. Untuk top up e-wallet yang kantongnya belum ada, pakai usul_jadikan_pindah dengan buat_kantong (kantong dibuat sekalian).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        nama: { type: SchemaType.STRING, description: "Nama kantong, mis. 'DANA'" },
        jenis: { type: SchemaType.STRING, format: "enum", enum: ["bank", "ewallet", "tunai"] },
        saldo_awal: { type: SchemaType.NUMBER, description: "Saldo awal yang disebut pengguna (bawaan 0)" },
        per: { type: SchemaType.STRING, description: "Saldo awal berlaku sejak YYYY-MM-DD (bawaan hari ini)" },
      },
      required: ["nama"],
    },
  },
  {
    name: "usul_jadikan_pindah",
    description:
      "USULAN menjadikan pengeluaran/pemasukan sebagai pindah kantong ke/dari kantong lain milik pengguna (mis. top up DANA dari BCA yang tercatat sebagai pengeluaran). Sisi lain yang sudah tercatat di kantong tujuan digabung otomatis. Bila kantong tujuan belum ada, isi buat_kantong supaya dibuat sekalian. Belum mengubah apa pun: pengguna menekan Terapkan.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        ids: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "id transaksi dari hasil cari/cari_kejanggalan/periksa_saldo" },
        saring: SKEMA_SARING,
        ke_kantong: { type: SchemaType.STRING, description: "Nama kantong lawan (tujuan top up / asal uang masuk)" },
        buat_kantong: { type: SchemaType.STRING, format: "enum", enum: ["bank", "ewallet", "tunai"], description: "Hanya bila ke_kantong belum ada: jenis kantong yang dibuat" },
        saldo_awal: { type: SchemaType.NUMBER, description: "Saldo awal kantong baru bila disebut pengguna (bawaan: dihitung supaya tidak minus)" },
      },
      required: ["ke_kantong"],
    },
  },
  {
    name: "usul_ubah_transaksi",
    description:
      "USULAN mengubah transaksi tercatat: kategori, merchant, keterangan, kantong, tanggal, jam, nominal. Pilih transaksinya dengan ids (dari hasil cari) atau saring (seperti cari), mis. semua Grab bulan ini. Nominal, tanggal & kantong transaksi rekening koran tidak bisa diubah (angka bank). Belum mengubah apa pun: pengguna menekan Terapkan.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        ids: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        saring: SKEMA_SARING,
        isian: {
          type: SchemaType.OBJECT,
          description: "Yang diubah (isi yang perlu saja)",
          properties: {
            kategori: { type: SchemaType.STRING, description: "Slug atau nama kategori yang ada" },
            merchant: { type: SchemaType.STRING },
            keterangan: { type: SchemaType.STRING },
            kantong: { type: SchemaType.STRING, description: "Nama kantong" },
            tanggal: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
            jam: { type: SchemaType.STRING, description: "HH:MM" },
            nominal: { type: SchemaType.NUMBER },
          },
        },
      },
      required: ["isian"],
    },
  },
  {
    name: "usul_hapus",
    description:
      "USULAN menghapus transaksi (mis. yang dobel), dengan ids dari hasil cari/periksa_saldo/cari_kejanggalan. Transaksi rekening koran hanya bisa dihapus bila ada kembarannya: hapus yang BUKAN dari rekening koran. Belum menghapus apa pun: pengguna menekan Terapkan.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { ids: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }, alasan: { type: SchemaType.STRING } },
      required: ["ids"],
    },
  },
  {
    name: "usul_selesaikan_draft",
    description:
      "USULAN menyelesaikan satu draft 'Belum selesai': isi yang kurang (kantong, kantong tujuan, jam) lalu simpan. id draft dari cari (status draft) atau cari_kejanggalan. Belum menyimpan apa pun: pengguna menekan Terapkan.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id: { type: SchemaType.STRING },
        isian: {
          type: SchemaType.OBJECT,
          properties: { kantong: { type: SchemaType.STRING }, kantong_tujuan: { type: SchemaType.STRING }, jam: { type: SchemaType.STRING, description: "HH:MM" } },
        },
      },
      required: ["id"],
    },
  },
  {
    name: "usul_catat",
    description:
      "USULAN mencatat SATU transaksi baru dari kalimat pengguna yang jelas (mis. 'tadi makan bakso 25rb pakai DANA'). Kantong wajib; kalau tidak disebut, tanya dulu. Belum mencatat apa pun: pengguna menekan Terapkan.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        jenis: { type: SchemaType.STRING, format: "enum", enum: ["keluar", "masuk", "pindah"] },
        nominal: { type: SchemaType.NUMBER },
        kategori: { type: SchemaType.STRING, description: "Slug atau nama kategori yang ada" },
        merchant: { type: SchemaType.STRING },
        keterangan: { type: SchemaType.STRING },
        kantong: { type: SchemaType.STRING },
        kantong_tujuan: { type: SchemaType.STRING, description: "Hanya untuk pindah" },
        tanggal: { type: SchemaType.STRING, description: "YYYY-MM-DD (bawaan hari ini)" },
        jam: { type: SchemaType.STRING, description: "HH:MM" },
      },
      required: ["jenis", "nominal", "kantong"],
    },
  },
];

/** Hanya untuk model ringan (SPEC-asisten-agen §1 lapis 2). */
export const DEKLARASI_SERAHKAN: FunctionDeclaration = {
  name: "serahkan",
  description:
    "Serahkan pertanyaan ini ke asisten yang lebih teliti bila butuh penyelidikan panjang (mencari penyebab saldo beda, banyak kantong/bulan, banyak langkah) atau kamu ragu. Semua hasil fungsi yang sudah didapat ikut diteruskan. Jangan dipakai untuk pertanyaan yang bisa dijawab dari ringkasan atau satu-dua fungsi.",
  parameters: { type: SchemaType.OBJECT, properties: { alasan: { type: SchemaType.STRING } }, required: ["alasan"] },
};

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
      merchant: typeof args.merchant === "string" ? args.merchant : undefined,
    },
    { kantong: k.kantong.map((x) => x.id), kategori: k.kategori.map((c) => `${c.type}:${c.slug}`) },
  );
}

/**
 * Tombol telusur untuk satu pemanggilan fungsi (kalkulator tidak punya tujuan).
 * `hasil` cari_transaksi: tanpa `jenis` tapi hanya berisi pengeluaran →
 * tautannya ke tab Keluar, angkanya tetap sama (SPEC-perbaikan-temuan G6).
 */
export function tautanDari(
  nama: NamaFungsi,
  args: Record<string, unknown>,
  k: KonteksTanya,
  hasil?: unknown,
): { label: string; href: string } | null {
  if (nama === "hitung" || nama.startsWith("usul_") || nama === "serahkan" || nama === "detail" || nama === "cari_kejanggalan") return null;
  if (nama === "periksa_saldo") return { label: "Lihat kantong", href: "/profil/kantong" };
  if (nama === "cari") {
    const c = bersihkanArgCari(args, k);
    if (c.sumber === "transaksi") {
      // Riwayat hanya menampilkan yang tercatat: draft tidak punya tautan.
      if (c.status === "draft") return null;
      const jenis = c.jenis ?? "semua";
      const f = bacaFilter(
        { jenis, dari: c.dari ?? undefined, sampai: c.sampai ?? undefined, kantong: c.kantong.join(","), kategori: c.kategori.flatMap((s) => k.kategori.filter((x) => x.slug === s).map((x) => `${x.type}:${x.slug}`)).join(","), q: c.kata ?? undefined },
        { kantong: k.kantong.map((x) => x.id), kategori: k.kategori.map((x) => `${x.type}:${x.slug}`) },
      );
      const disaringLain = c.minimal != null || c.maksimal != null || c.asal.length > 0 || c.refBank != null || c.status === "perlu_dilengkapi";
      return { label: disaringLain ? "Lihat semua di Riwayat" : "Lihat di Riwayat", href: alamatRiwayat(f) };
    }
    if (c.sumber === "cicilan" || c.sumber === "pinjaman") return { label: "Buka Utang & Piutang", href: "/pinjaman" };
    if (c.sumber === "tujuan") return { label: "Lihat tujuan tabungan", href: "/profil/tujuan" };
    return { label: "Lihat kantong", href: "/profil/kantong" };
  }
  // Riwayat belum bisa mengecualikan atau membatasi nominal: tautannya menampilkan sebelum dikecualikan.
  const disaring = (Array.isArray(args.kecuali) && args.kecuali.length > 0) || args.minimal != null || args.maksimal != null;
  if (nama === "cari_transaksi") {
    const h = (hasil ?? {}) as { total_keluar?: number; total_masuk?: number };
    const keluarSaja = args.jenis == null && h.total_masuk === 0 && Number(h.total_keluar) > 0;
    return { label: disaring ? "Lihat semua di Riwayat" : "Lihat di Riwayat", href: alamatRiwayat(filterDariArgumen(keluarSaja ? { ...args, jenis: "keluar" } : args, k)) };
  }
  if (nama === "ringkasan_bulan") {
    const bulan = bulanDariArgumen(args, k.hariIni);
    const nama = new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(new Date(`${bulan}-01T00:00:00Z`));
    return { label: `Buka Analitik ${nama.charAt(0).toUpperCase()}${nama.slice(1)}`, href: bulan === k.hariIni.slice(0, 7) ? "/analitik" : `/analitik?bulan=${bulan}` };
  }
  if (nama === "saldo_kantong") return { label: "Lihat kantong", href: "/profil/kantong" };
  return { label: "Buka Utang & Piutang", href: "/pinjaman" };
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

/**
 * Tautan jawaban (SPEC-analitik-ai): tautan dari fungsi yang dipanggil, plus
 * "Buka Analitik [bulan]" bila jawabannya memakai angka dari ringkasan bulan
 * yang dihitung di depan — seperti saat model memanggil ringkasan_bulan.
 */
export function tautanJawaban(
  dariFungsi: { label: string; href: string }[],
  { jawaban, ringkasan, bulan }: { jawaban: string; ringkasan: unknown; bulan: string },
  k: KonteksTanya,
): { label: string; href: string }[] {
  const ringkas = tautanDari("ringkasan_bulan", { bulan }, k)!;
  const pakaiRingkasan = rupiahDiJawaban(jawaban).length > rupiahTakTerverifikasi(jawaban, [ringkasan]).length;
  return pakaiRingkasan && !dariFungsi.some((t) => t.href === ringkas.href) ? [...dariFungsi, ringkas] : dariFungsi;
}

/**
 * Hasil saldo_kantong: kantong biasa, lalu tujuan tabungan per tujuan.
 * Jumlah semua tujuan diberi nama sendiri (`total_semua_tujuan`), supaya
 * tidak dibaca sebagai isi satu tujuan (SPEC-perbaikan-temuan B9).
 *
 * Simpanan (SPEC-simpanan): kantong menyebut simpanan & tujuan di dalamnya
 * beserta saldo gabungannya; simpanan menyebut induknya, dan deposito
 * membawa bunga, jatuh tempo, dan perkiraan bunga bersih. Deposito yang
 * sudah selesai tidak ikut.
 */
export function ringkasSaldo(
  kantong: {
    id: string;
    name: string;
    kind: string;
    target?: number | string | null;
    tenggat?: string | null;
    induk_id?: string | null;
    macam_simpanan?: string | null;
  }[],
  saldo: Map<string, number>,
  simpanan: { deposito: Deposito[]; periode: PeriodeDeposito[]; hariIni: string } = { deposito: [], periode: [], hariIni: "" },
) {
  const selesai = new Set(simpanan.deposito.filter((d) => d.selesai).map((d) => d.kantong_id));
  kantong = kantong.filter((k) => !selesai.has(k.id));
  const tujuan = kantong.filter((k) => k.kind === "tujuan");
  const nama = (id: string | null | undefined) => kantong.find((k) => k.id === id)?.name ?? null;
  const rinci = (k: (typeof kantong)[number]) => {
    const isi = kantong.filter((x) => x.induk_id === k.id);
    const sendiri = saldo.get(k.id) ?? 0;
    const d = simpanan.deposito.find((x) => x.kantong_id === k.id);
    const p = d ? periodeAktif(simpanan.periode, d.kantong_id) : null;
    return {
      ...(isi.length
        ? // `saldo` = gabungan, yang tampil di aplikasi & bank (SPEC-simpanan U1).
          { saldo: sendiri + isi.reduce((n, x) => n + (saldo.get(x.id) ?? 0), 0), saldo_sendiri: sendiri, berisi: isi.map((x) => x.name) }
        : {}),
      ...(k.kind === "simpanan" ? { di_dalam: nama(k.induk_id), macam: k.macam_simpanan === "deposito" ? "deposito" : "tabungan/pocket" } : {}),
      ...(d
        ? {
            deposito: {
              bunga_persen_per_tahun: Number(d.bunga_persen),
              // Tanggal untuk dibaca ("6 Desember 2026"), supaya jawabannya ikut (U2).
              jatuh_tempo: p ? fmtTanggalPanjang(p.jatuh_tempo) : null,
              estimasi_bunga_bersih: p ? Number(p.bunga_bersih) : null,
              saat_jatuh_tempo: NAMA_PERPANJANGAN[d.perpanjangan],
              menunggu_cek_bunga: Boolean(p && menungguCek(p, simpanan.hariIni)),
            },
          }
        : {}),
    };
  };
  return {
    kantong: kantong.filter((k) => k.kind !== "tujuan").map((k) => ({ nama: k.name, jenis: k.kind, saldo: saldo.get(k.id) ?? 0, ...rinci(k) })),
    // Saldo tujuan = yang sudah terkumpul di tujuan itu saja.
    tujuan_tabungan: tujuan.map((k) => ({
      nama_tujuan: k.name,
      terkumpul: saldo.get(k.id) ?? 0,
      target: Number(k.target ?? 0),
      tenggat: k.tenggat ? fmtTanggalPanjang(k.tenggat) : null,
      ...(k.induk_id ? { disimpan_di: nama(k.induk_id) } : {}),
    })),
    ...(tujuan.length ? { total_semua_tujuan: tujuan.reduce((n, k) => n + (saldo.get(k.id) ?? 0), 0) } : {}),
    // Total aset hanya kantong uang (termasuk tujuan tabungan); orang & kartu kredit di Utang & Piutang.
    total_aset: kantong.filter(kantongUang).reduce((n, k) => n + (saldo.get(k.id) ?? 0), 0),
  };
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

export interface ArgCari {
  sumber: (typeof SUMBER_CARI)[number];
  dari: string | null;
  sampai: string | null;
  /** id kantong milik user (nama dari AI dicocokkan). */
  kantong: string[];
  /** Nama kantong dari AI yang tidak ada: dilaporkan ke model, bukan diabaikan diam-diam. */
  kantongTakDikenal: string[];
  jenis: "keluar" | "masuk" | "pindah" | null;
  kategori: string[];
  status: "semua" | "tercatat" | "draft" | "perlu_dilengkapi";
  /** Nilai kolom source. */
  asal: string[];
  minimal: number | null;
  maksimal: number | null;
  kata: string | null;
  refBank: boolean | null;
  kelompokkan: (typeof KELOMPOK_CARI)[number] | null;
  urutkan: (typeof URUT_CARI)[number];
  batas: number;
}

export const tanggalSah = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const pilih = <T extends string>(v: unknown, daftar: readonly T[]): T | null => (typeof v === "string" && (daftar as readonly string[]).includes(v) ? (v as T) : null);
/** Angka dari AI (kadang berupa teks "50000"). */
export const angkaArg = (v: unknown): number | null => {
  // "1.250.000" (titik ribuan) dan "1250000.5" sama-sama terbaca.
  const teks = typeof v === "string" ? v.replace(/[^\d.,-]/g, "") : "";
  const n = typeof v === "number" ? v : teks ? Number(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(teks) ? teks.replace(/\./g, "").replace(",", ".") : teks.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};
export const daftarTeks = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 20);

/**
 * Argumen `cari` dari AI → saringan yang aman: sumber/kelompok/urutan dari
 * daftar tetap, tanggal harus tanggal sungguhan, kantong & kategori harus
 * milik user, kata dibersihkan seperti kolom cari Riwayat (aman dirangkai ke
 * filter PostgREST), batas 1–50.
 */
export function bersihkanArgCari(args: Record<string, unknown>, k: KonteksTanya): ArgCari {
  const s = (args.saring && typeof args.saring === "object" ? args.saring : {}) as Record<string, unknown>;
  // Model kadang menaruh saringan di tingkat atas.
  const ambil = (kunci: string) => s[kunci] ?? args[kunci];
  let dari = tanggalSah(ambil("dari")) ? (ambil("dari") as string) : null;
  let sampai = tanggalSah(ambil("sampai")) ? (ambil("sampai") as string) : null;
  if (dari && sampai && dari > sampai) [dari, sampai] = [sampai, dari];
  const namaKantong = daftarTeks(ambil("kantong"));
  const cocok = namaKantong.map((n) => ({ n, id: cocokkanKantong(n, k.kantong)?.id ?? null }));
  const slugSah = new Set(k.kategori.map((c) => c.slug));
  const kata = typeof ambil("kata") === "string" ? bersihkanCari(ambil("kata") as string) : "";
  const ref = ambil("ref_bank");
  const batas = angkaArg(args.batas);
  return {
    sumber: pilih(args.sumber, SUMBER_CARI) ?? "transaksi",
    dari,
    sampai,
    kantong: [...new Set(cocok.flatMap((x) => (x.id ? [x.id] : [])))],
    kantongTakDikenal: cocok.filter((x) => !x.id).map((x) => x.n.slice(0, 40)),
    jenis: pilih(ambil("jenis"), ["keluar", "masuk", "pindah"] as const),
    kategori: daftarTeks(ambil("kategori")).filter((x) => slugSah.has(x)),
    status: pilih(ambil("status"), ["semua", "tercatat", "draft", "perlu_dilengkapi"] as const) ?? "semua",
    asal: [...new Set(daftarTeks(ambil("asal")).flatMap((a) => (ASAL_CARI[a] ? [ASAL_CARI[a]] : [])))],
    minimal: angkaArg(ambil("minimal")),
    maksimal: angkaArg(ambil("maksimal")),
    kata: kata || null,
    refBank: ref === "ada" || ref === true ? true : ref === "tidak" || ref === false ? false : null,
    kelompokkan: pilih(args.kelompokkan, KELOMPOK_CARI),
    urutkan: pilih(args.urutkan, URUT_CARI) ?? "terbaru",
    batas: batas == null ? 20 : Math.min(MAKS_RINCI, Math.max(1, Math.round(batas))),
  };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** id untuk `detail`: harus berbentuk uuid (dirangkai ke query). */
export const idDariArgumen = (args: Record<string, unknown>) => (typeof args.id === "string" && UUID.test(args.id.trim()) ? args.id.trim().toLowerCase() : null);

/** Jenis untuk `cari_kejanggalan`; "semua"/tidak dikenal = semua. */
export const jenisKejanggalanDari = (args: Record<string, unknown>): JenisKejanggalan | null => pilih(args.jenis, JENIS_KEJANGGALAN);

/** Argumen periksa_saldo: kantong (dicocokkan), tanggal sah, saldo bank > -1 triliun. */
export function bersihkanArgPeriksa(args: Record<string, unknown>, k: KonteksTanya) {
  const nama = typeof args.kantong === "string" ? args.kantong.trim().slice(0, 60) : "";
  const saldo = angkaArg(args.saldo_bank);
  return {
    nama,
    kantongId: nama ? (cocokkanKantong(nama, k.kantong)?.id ?? null) : null,
    sampai: tanggalSah(args.sampai) && args.sampai <= k.hariIni ? args.sampai : null,
    saldoBank: saldo != null && Math.abs(saldo) < 1e12 ? saldo : null,
  };
}

const NAMA_SUMBER: Record<string, string> = {
  transaksi: "transaksi",
  kantong: "kantong",
  simpanan: "simpanan",
  deposito: "deposito",
  cicilan: "cicilan",
  pinjaman: "utang & piutang",
  tujuan: "tujuan tabungan",
  impor: "riwayat impor rekening koran",
};

/**
 * Langkah yang dialirkan ke layar saat fungsi dijalankan (SPEC-asisten-agen §5):
 * "Mencari top up DANA…", "Memeriksa saldo Jago…". Dari argumen yang sudah
 * dibersihkan; tidak pernah menyebut model.
 */
export function labelLangkah(nama: string, args: Record<string, unknown>, k: KonteksTanya): string {
  const kantong = (id: string) => k.kantong.find((x) => x.id === id)?.name ?? "";
  switch (nama) {
    case "ringkasan_bulan": {
      const b = bulanDariArgumen(args, k.hariIni);
      return `Membaca ringkasan ${new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${b}-01T00:00:00Z`))}…`;
    }
    case "cari_transaksi": {
      const kata = typeof args.merchant === "string" ? args.merchant : typeof args.kata === "string" ? args.kata : "";
      return kata ? `Mencari transaksi ${kata.slice(0, 40)}…` : "Mencari transaksi…";
    }
    case "saldo_kantong":
      return "Melihat saldo kantong…";
    case "pinjaman_cicilan":
      return "Melihat utang, piutang & cicilan…";
    case "hitung":
      return "Menghitung…";
    case "usul_ubah_kategori":
      return "Menyiapkan usulan kategori…";
    case "usul_buat_kantong":
      return `Menyiapkan usulan kantong ${typeof args.nama === "string" ? args.nama.slice(0, 30) : "baru"}…`;
    case "usul_jadikan_pindah":
      return `Menyiapkan usulan pindah kantong${typeof args.ke_kantong === "string" ? ` ${args.ke_kantong.slice(0, 30)}` : ""}…`;
    case "usul_ubah_transaksi":
      return "Menyiapkan usulan perubahan…";
    case "usul_hapus":
      return "Menyiapkan usulan hapus…";
    case "usul_selesaikan_draft":
      return "Menyiapkan usulan simpan draft…";
    case "usul_catat":
      return "Menyiapkan catatan baru…";
    case "cari": {
      const c = bersihkanArgCari(args, k);
      const di = c.kantong.length ? ` di ${c.kantong.map(kantong).filter(Boolean).join(", ")}` : "";
      if (c.sumber === "transaksi") {
        const apa = c.status === "draft" ? "draft" : c.status === "perlu_dilengkapi" ? "transaksi yang perlu dilengkapi" : "transaksi";
        return `Mencari ${c.kata ? c.kata.slice(0, 40) : apa}${di}…`;
      }
      return `Melihat ${NAMA_SUMBER[c.sumber]}${di}…`;
    }
    case "detail":
      return "Membuka rincian transaksi…";
    case "periksa_saldo": {
      const p = bersihkanArgPeriksa(args, k);
      return `Memeriksa saldo ${p.kantongId ? kantong(p.kantongId) : p.nama || "kantong"}…`;
    }
    case "cari_kejanggalan":
      return "Mencari yang perlu dirapikan…";
    case "serahkan":
      return "Menyelidiki lebih jauh…";
    default:
      return "Mencari data…";
  }
}
