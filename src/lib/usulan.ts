import { cocokkanKantong, hitungSaldo, kantongDeposito, type Kantong } from "@/lib/kantong";
import { tebakJenisKantong } from "@/lib/lembaga";
import { KELOMPOK, NAMA_KELOMPOK, type Kelompok } from "@/lib/metode";
import type { TxPeriksa } from "@/lib/periksa";
import { selisihHari } from "@/lib/rekening/teks";
import { angkaArg, tanggalSah, UUID } from "@/lib/tanya";

/**
 * Alat ubah asisten (SPEC-asisten-agen §3): AI tidak pernah menulis. Tiap alat
 * `usul_*` menyusun USULAN dari data yang sudah dimuat (fungsi murni di sini,
 * pemuatnya di src/lib/usulan-server.ts): apa yang berubah, sebelum → sesudah,
 * jumlah transaksi, dan saldo kantong sebelum → sesudah. Browser
 * menampilkannya sebagai kartu; baru saat user menekan Terapkan, isiannya
 * dikirim ke RPC terapkan_usulan, yang memeriksa ulang semuanya (pemilik,
 * angka bank, updated_at) dalam satu transaksi database. Diuji di
 * scripts/uji-usulan.mts.
 */

/** Satu usulan paling banyak 200 transaksi (P5); sisanya diusulkan lagi sesudahnya. */
export const MAKS_USULAN = 200;

export const JENIS_USULAN = ["buat_kantong", "jadikan_pindah", "ubah_transaksi", "ubah_kategori", "hapus", "selesaikan_draft", "catat"] as const;
export type JenisUsulan = (typeof JENIS_USULAN)[number];

/**
 * Isian RPC terapkan_usulan (bentuknya dijelaskan di migrasi 20261123000000_asisten_aksi.sql;
 * kategori_baru & isian category "baru" di 20261124000000_ubah_kategori_asisten.sql).
 */
export interface IsianUsulan {
  jenis: JenisUsulan;
  ringkasan: string;
  kantong_baru?: { nama: string; jenis: "bank" | "ewallet" | "cash"; saldo_awal: number; saldo_sejak: string };
  kategori_baru?: { type: "expense" | "income"; nama: string; kelompok: string | null };
  ubah?: { id: string; updated_at: string; isian: Record<string, string | number | null> }[];
  pindah?: { id: string; updated_at: string; ke: string; gabung?: { id: string; updated_at: string } | null }[];
  hapus?: { id: string; updated_at: string }[];
  draft?: { id: string; updated_at: string; isian: Record<string, string | null> }[];
  sisip?: Record<string, string | number | null>[];
}

/** Satu baris di kartu: transaksinya, lalu keadaan sebelum → sesudah. */
export interface BarisUsulan {
  id: string | null;
  tanggal: string;
  teks: string;
  nominal: number;
  sebelum: string | null;
  sesudah: string | null;
}

export interface UsulanAksi {
  /** Pengenal kartu di obrolan (bukan id database). */
  kunci: string;
  jenis: JenisUsulan;
  judul: string;
  jumlah: number;
  total: number;
  baris: BarisUsulan[];
  /** Saldo kantong yang tersentuh, sebelum → sesudah diterapkan (sebelum null = kantong baru). */
  saldo: { nama: string; sebelum: number | null; sesudah: number }[];
  /** Yang dilewati/disesuaikan, untuk user & model. */
  catatan: string[];
  /** id kantong yang tersentuh ("baru" = kantong yang dibuat usulan ini), untuk saldo sesudah diterapkan. */
  kantong: string[];
  isian: IsianUsulan;
}

export interface KonteksUsulan {
  hariIni: string;
  kantong: Kantong[];
  saldo: Map<string, number>;
  kategori: { type: string; slug: string; name: string }[];
}

export type HasilUsulan = { untukModel: Record<string, unknown>; usulan?: UsulanAksi };

export type TxUsulan = TxPeriksa;

const STATUS_USULAN = "USULAN, BELUM DITERAPKAN. Belum ada yang berubah: pengguna harus menekan Terapkan di kartu di bawah jawabanmu. Jangan bilang sudah diubah.";

const teksArg = (v: unknown, maks: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, maks) : null);
const jamArg = (v: unknown) => {
  const m = typeof v === "string" ? v.trim().match(/^(\d{1,2})[:.](\d{2})/) : null;
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
};
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const kunciBaru = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `u${Date.now()}${Math.random().toString(36).slice(2)}`);

/** id transaksi dari AI: hanya yang berbentuk uuid, unik, paling banyak MAKS_USULAN + 1 (untuk tahu ada sisa). */
export function idsDariArgumen(v: unknown): string[] {
  const daftar = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,]+/) : [];
  return [...new Set(daftar.filter((x): x is string => typeof x === "string" && UUID.test(x.trim())).map((x) => x.trim().toLowerCase()))].slice(0, MAKS_USULAN + 1);
}

/** Kantong yang boleh dipakai usulan (bukan deposito). */
const kantongPilihan = (k: KonteksUsulan) => k.kantong.filter((x) => !kantongDeposito(x));
const UANG = ["bank", "ewallet", "cash", "tujuan", "simpanan"];

export function cariKantongUsulan(nama: unknown, k: KonteksUsulan, uang = false): Kantong | null {
  const teks = teksArg(nama, 60);
  if (!teks) return null;
  const daftar = kantongPilihan(k).filter((x) => !uang || UANG.includes(x.kind));
  return cocokkanKantong(teks, daftar) ?? daftar.find((x) => x.name.toLowerCase() === teks.toLowerCase()) ?? null;
}

export function cariKategoriUsulan(teks: unknown, type: string, k: KonteksUsulan) {
  const t = teksArg(teks, 40)?.toLowerCase();
  if (!t) return null;
  const daftar = k.kategori.filter((c) => c.type === type);
  return daftar.find((c) => c.slug === t) ?? daftar.find((c) => c.name.toLowerCase() === t) ?? null;
}

const namaKantong = (id: string | null | undefined, k: KonteksUsulan, baru?: string) => (id === "baru" ? (baru ?? "kantong baru") : (k.kantong.find((x) => x.id === id)?.name ?? "tanpa kantong"));
const namaKat = (slug: string | null | undefined, type: string, k: KonteksUsulan) => k.kategori.find((c) => c.slug === slug && c.type === type)?.name ?? "Lainnya";
const teksTx = (t: TxUsulan, k: KonteksUsulan) => t.merchant || t.description || (t.type === "transfer" ? "Pindah kantong" : namaKat(t.category, t.type, k));

/** "Pengeluaran · Makan · BCA" / "Pindah BCA → DANA" / "Draft · kantong belum diisi". */
export function gambarkan(t: Pick<TxUsulan, "type" | "category" | "kantong_id" | "kantong_tujuan_id" | "status">, k: KonteksUsulan, baru?: string): string {
  const draft = t.status === "needs_review" ? "Draft · " : "";
  if (t.type === "transfer") return `${draft}Pindah ${namaKantong(t.kantong_id, k, baru)} → ${t.kantong_tujuan_id ? namaKantong(t.kantong_tujuan_id, k, baru) : "?"}`;
  const kantong = t.kantong_id ? namaKantong(t.kantong_id, k, baru) : "kantong belum diisi";
  return `${draft}${t.type === "income" ? "Pemasukan" : "Pengeluaran"} · ${namaKat(t.category, t.type, k)} · ${kantong}`;
}

/**
 * Saldo kantong sebelum → sesudah: selisih sumbangan transaksi yang berubah, dengan
 * aturan hitungSaldo (sejak saldo awal; draft tidak dihitung). Kantong baru (id
 * "baru") ikut dihitung dari saldo awalnya.
 */
export function simulasiSaldo(
  k: KonteksUsulan,
  sebelum: TxUsulan[],
  sesudah: TxUsulan[],
  baru?: { nama: string; saldo_awal: number; saldo_sejak: string; kind: string },
): UsulanAksi["saldo"] {
  const kosong = (x: Kantong): Kantong => ({ ...x, saldo_awal: 0 });
  const daftar: Kantong[] = [...k.kantong.map(kosong)];
  if (baru) {
    const tanggal = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(baru.saldo_sejak));
    daftar.push({ id: "baru", name: baru.nama, kind: baru.kind as Kantong["kind"], aliases: null, saldo_awal: 0, saldo_per: tanggal, saldo_sejak: baru.saldo_sejak });
  }
  const tercatat = (d: TxUsulan[]) => d.filter((t) => (t.status ?? "confirmed") === "confirmed");
  const a = new Map(hitungSaldo(daftar, tercatat(sebelum)).map((s) => [s.id, s.saldo]));
  const b = new Map(hitungSaldo(daftar, tercatat(sesudah)).map((s) => [s.id, s.saldo]));
  const hasil: UsulanAksi["saldo"] = [];
  for (const x of daftar) {
    const geser = (b.get(x.id) ?? 0) - (a.get(x.id) ?? 0);
    if (x.id === "baru") hasil.push({ nama: x.name, sebelum: null, sesudah: (baru?.saldo_awal ?? 0) + geser });
    else if (Math.abs(geser) >= 0.005) {
      const kini = k.saldo.get(x.id) ?? 0;
      hasil.push({ nama: x.name, sebelum: kini, sesudah: kini + geser });
    }
  }
  return hasil;
}

const barisDari = (t: TxUsulan, k: KonteksUsulan, sebelum: string | null, sesudah: string | null): BarisUsulan => ({
  id: t.id,
  tanggal: t.transaction_date,
  teks: teksTx(t, k),
  nominal: Number(t.amount),
  sebelum,
  sesudah,
});

/** Ringkasan untuk model: status, angka, saldo, catatan, dan beberapa contoh. */
function untukModel(u: UsulanAksi, tambahan: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: STATUS_USULAN,
    usulan: u.judul,
    jumlah_transaksi: u.jumlah,
    total: u.total,
    ...(u.saldo.length ? { saldo_kantong: u.saldo.map((s) => ({ kantong: s.nama, sebelum: s.sebelum, sesudah: s.sesudah })) } : {}),
    ...(u.catatan.length ? { catatan: u.catatan } : {}),
    contoh: u.baris.slice(0, 5).map((b) => ({ tanggal: b.tanggal, transaksi: b.teks, nominal: b.nominal, sebelum: b.sebelum, sesudah: b.sesudah })),
    ...tambahan,
  };
}

/** Potong ke MAKS_USULAN; catatan sisa untuk model & kartu. */
function potong<T>(daftar: T[], catatan: string[]): T[] {
  if (daftar.length <= MAKS_USULAN) return daftar;
  catatan.push(`Usulan ini ${MAKS_USULAN} transaksi pertama; ${daftar.length - MAKS_USULAN} lainnya bisa diusulkan lagi sesudah ini diterapkan.`);
  return daftar.slice(0, MAKS_USULAN);
}

const JENIS_KANTONG: Record<string, "bank" | "ewallet" | "cash"> = { bank: "bank", ewallet: "ewallet", "e-wallet": "ewallet", dompet_digital: "ewallet", tunai: "cash", cash: "cash" };

/** Jenis kantong baru: dari AI (bank/ewallet/tunai), atau ditebak dari namanya. Kartu kredit/paylater tidak lewat sini. */
function jenisKantongBaru(v: unknown, nama: string): "bank" | "ewallet" | "cash" | null {
  const dari = typeof v === "string" ? JENIS_KANTONG[v.trim().toLowerCase()] : undefined;
  if (dari) return dari;
  const tebak = tebakJenisKantong(nama);
  return tebak === "kredit" ? null : tebak;
}

const saldoSejakTanggal = (tanggal: string) => `${tanggal}T00:00:00+07:00`;

// --- usul_buat_kantong ----------------------------------------------------------

export function usulBuatKantong(args: Record<string, unknown>, k: KonteksUsulan): HasilUsulan {
  const nama = teksArg(args.nama, 40);
  if (!nama) return { untukModel: { error: "nama kantong wajib diisi" } };
  const ada = k.kantong.find((x) => x.name.toLowerCase() === nama.toLowerCase()) ?? cocokkanKantong(nama, k.kantong);
  if (ada) return { untukModel: { error: `Kantong "${ada.name}" sudah ada.`, kantong_yang_ada: k.kantong.map((x) => x.name) } };
  const jenis = jenisKantongBaru(args.jenis, nama);
  if (!jenis) return { untukModel: { error: "Kartu kredit/paylater dibuat di aplikasi (Profil → Kantong), bukan lewat asisten." } };
  const saldoAwal = Math.max(0, angkaArg(args.saldo_awal) ?? 0);
  const per = tanggalSah(args.per) && args.per <= k.hariIni ? args.per : k.hariIni;
  const isian: IsianUsulan = { jenis: "buat_kantong", ringkasan: `Buat kantong ${nama}`, kantong_baru: { nama, jenis, saldo_awal: saldoAwal, saldo_sejak: saldoSejakTanggal(per) } };
  const usulan: UsulanAksi = {
    kunci: kunciBaru(),
    jenis: "buat_kantong",
    judul: `Buat kantong ${nama}`,
    jumlah: 0,
    total: 0,
    baris: [],
    saldo: [{ nama, sebelum: null, sesudah: saldoAwal }],
    catatan: [`${jenis === "ewallet" ? "E-wallet" : jenis === "cash" ? "Tunai" : "Bank"}, saldo awal ${rp(saldoAwal)} sejak ${per}.`],
    kantong: ["baru"],
    isian,
  };
  return { usulan, untukModel: untukModel(usulan, { kantong_baru: { nama, jenis, saldo_awal: saldoAwal, berlaku_sejak: per } }) };
}

// --- usul_ubah_transaksi --------------------------------------------------------

/**
 * Ubah kategori, merchant, keterangan, kantong, tanggal/jam, nominal. Transaksi
 * rekening koran: nominal, tanggal, dan kantongnya angka bank — bagian itu
 * dilewati (dicatat), bagian lain tetap diubah.
 */
export function usulUbahTransaksi(baris: TxUsulan[], args: Record<string, unknown>, k: KonteksUsulan): HasilUsulan {
  const i = (args.isian && typeof args.isian === "object" ? args.isian : args) as Record<string, unknown>;
  const minta = {
    kategori: teksArg(i.kategori, 40),
    merchant: teksArg(i.merchant, 100),
    keterangan: teksArg(i.keterangan, 500),
    kantong: teksArg(i.kantong, 60),
    tanggal: tanggalSah(i.tanggal) && i.tanggal <= k.hariIni ? i.tanggal : null,
    jam: jamArg(i.jam),
    nominal: angkaArg(i.nominal),
  };
  if (Object.values(minta).every((v) => v == null)) return { untukModel: { error: "isian kosong: sebut apa yang diubah (kategori, merchant, keterangan, kantong, tanggal, jam, nominal)" } };
  if (minta.nominal != null && !(minta.nominal > 0)) return { untukModel: { error: "nominal harus lebih dari 0" } };
  const kantong = minta.kantong ? cariKantongUsulan(minta.kantong, k) : null;
  if (minta.kantong && !kantong) return { untukModel: { error: `Kantong "${minta.kantong}" tidak ada.`, kantong_yang_ada: kantongPilihan(k).map((x) => x.name) } };
  const tercatat = baris.filter((t) => t.status === "confirmed");
  if (!tercatat.length) return { untukModel: { jumlah_transaksi: 0, pesan: "Tidak ada transaksi tercatat yang cocok. Draft diselesaikan dengan usul_selesaikan_draft." } };

  const catatan: string[] = [];
  let lewatBank = 0;
  let lewatPindah = 0;
  const kategoriTakAda = new Set<string>();
  const ubah: { t: TxUsulan; isian: Record<string, string | number | null>; sesudah: TxUsulan }[] = [];
  for (const t of tercatat) {
    const isian: Record<string, string | number | null> = {};
    const bank = Boolean(t.ref_bank || t.ref_bank_tujuan);
    if (minta.kategori) {
      if (t.type === "transfer") lewatPindah++;
      else {
        const c = cariKategoriUsulan(minta.kategori, t.type, k);
        if (!c) kategoriTakAda.add(t.type);
        else if (c.slug !== t.category) isian.category = c.slug;
      }
    }
    if (minta.merchant && minta.merchant !== t.merchant) isian.merchant = minta.merchant;
    if (minta.keterangan && minta.keterangan !== t.description) isian.description = minta.keterangan;
    if (minta.jam && minta.jam !== t.waktu?.slice(0, 5)) isian.waktu = minta.jam;
    const bagianBank = (minta.nominal != null && Number(t.amount) !== minta.nominal) || (minta.tanggal && minta.tanggal !== t.transaction_date) || (kantong && kantong.id !== t.kantong_id);
    if (bank && bagianBank) lewatBank++;
    if (!bank) {
      if (minta.nominal != null && Number(t.amount) !== minta.nominal) isian.amount = minta.nominal;
      if (minta.tanggal && minta.tanggal !== t.transaction_date) isian.transaction_date = minta.tanggal;
      if (kantong && kantong.id !== t.kantong_id) {
        if (t.type === "transfer" && t.kantong_tujuan_id === kantong.id) lewatPindah++;
        else isian.kantong_id = kantong.id;
      }
    }
    if (Object.keys(isian).length) {
      const sesudah = { ...t, ...isian, amount: isian.amount ?? t.amount } as TxUsulan;
      ubah.push({ t, isian, sesudah });
    }
  }
  if (kategoriTakAda.size && !ubah.length)
    return {
      untukModel: {
        error: `Kategori "${minta.kategori}" tidak ada.`,
        kategori_yang_ada: k.kategori.filter((c) => kategoriTakAda.has(c.type)).map((c) => `${c.slug}: ${c.name}`),
        saran: "Pakai kategori yang ada, atau usul_ubah_kategori (bisa membuat kategori baru) untuk semua transaksi satu merchant.",
      },
    };
  if (lewatBank) catatan.push(`${lewatBank} transaksi dari rekening koran: nominal, tanggal & kantongnya angka bank, jadi bagian itu tidak diubah.`);
  if (lewatPindah) catatan.push(`${lewatPindah} pindah kantong dilewati (pindah kantong tidak berkategori / kantongnya sudah itu).`);
  if (kategoriTakAda.size) catatan.push(`Kategori "${minta.kategori}" tidak ada untuk sebagian jenis transaksi; yang itu tidak diubah.`);
  if (!ubah.length) return { untukModel: { jumlah_transaksi: 0, pesan: "Semua transaksi yang cocok sudah seperti itu.", ...(catatan.length ? { catatan } : {}) } };

  const dipakai = potong(ubah, catatan);
  const apa = [
    minta.kategori && dipakai.some((u) => u.isian.category) ? `kategori jadi ${namaKat(dipakai.find((u) => u.isian.category)!.isian.category as string, dipakai.find((u) => u.isian.category)!.t.type, k)}` : null,
    minta.merchant ? `merchant jadi ${minta.merchant}` : null,
    minta.keterangan ? "keterangan" : null,
    kantong ? `kantong jadi ${kantong.name}` : null,
    minta.tanggal ? `tanggal jadi ${minta.tanggal}` : null,
    minta.jam ? `jam jadi ${minta.jam}` : null,
    minta.nominal != null ? `nominal jadi ${rp(minta.nominal)}` : null,
  ].filter(Boolean);
  const gambarIsian = (t: TxUsulan, isian: Record<string, unknown>) =>
    [
      "category" in isian ? namaKat(t.category, t.type, k) : null,
      "merchant" in isian ? t.merchant || "(tanpa merchant)" : null,
      "description" in isian ? t.description || "(tanpa keterangan)" : null,
      "kantong_id" in isian ? namaKantong(t.kantong_id, k) : null,
      "transaction_date" in isian ? t.transaction_date : null,
      "waktu" in isian ? t.waktu?.slice(0, 5) || "tanpa jam" : null,
      "amount" in isian ? rp(Number(t.amount)) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const usulan: UsulanAksi = {
    kunci: kunciBaru(),
    jenis: "ubah_transaksi",
    judul: `Ubah ${dipakai.length} transaksi: ${apa.join(", ")}`,
    jumlah: dipakai.length,
    total: dipakai.reduce((n, u) => n + Number(u.t.amount), 0),
    baris: dipakai.map((u) => barisDari(u.t, k, gambarIsian(u.t, u.isian), gambarIsian(u.sesudah, u.isian))),
    saldo: simulasiSaldo(k, dipakai.map((u) => u.t), dipakai.map((u) => u.sesudah)),
    catatan,
    kantong: [...new Set(dipakai.flatMap((u) => [u.t.kantong_id, u.sesudah.kantong_id, u.t.kantong_tujuan_id]).filter((x): x is string => Boolean(x)))],
    isian: { jenis: "ubah_transaksi", ringkasan: `Ubah ${dipakai.length} transaksi`, ubah: dipakai.map((u) => ({ id: u.t.id, updated_at: u.t.updated_at, isian: u.isian })) },
  };
  return { usulan, untukModel: untukModel(usulan) };
}

// --- usul_ubah_kategori ---------------------------------------------------------

/**
 * "X itu kategori Y" (SPEC-ingat-kategori): semua transaksi tercatat dari satu
 * merchant (`serupa`, hasil cariSerupa per jenis) jadi kategori Y; jenisnya
 * yang transaksinya lebih banyak. Kategori yang belum ada dibuat di usulan
 * yang sama (isian category "baru"). Transaksi berikutnya dari merchant itu
 * otomatis ikut, karena kategori diingat dari transaksi terakhirnya.
 */
export function usulUbahKategori(serupa: { expense: TxUsulan[]; income: TxUsulan[] }, args: Record<string, unknown>, k: KonteksUsulan): HasilUsulan {
  const merchant = teksArg(args.merchant, 200);
  const minta = teksArg(args.kategori, 30);
  if (!merchant || !minta) return { untukModel: { error: "merchant dan kategori wajib diisi" } };
  const type = serupa.expense.length >= serupa.income.length ? "expense" : "income";
  const baris = serupa[type].filter((t) => (t.status ?? "confirmed") === "confirmed");
  if (!baris.length) return { untukModel: { jumlah_transaksi: 0, pesan: `Tidak ada transaksi dengan merchant "${merchant}".` } };
  const ada = cariKategoriUsulan(minta, type, k);
  const ubah = ada ? baris.filter((t) => t.category !== ada.slug) : baris;
  if (!ubah.length) return { untukModel: { jumlah_transaksi: 0, pesan: `Semua transaksi ${merchant} sudah berkategori ${ada!.name}.` } };
  const nama = ada?.name ?? minta.charAt(0).toUpperCase() + minta.slice(1);
  const kelompok: Kelompok | null = type === "expense" ? (KELOMPOK.includes(args.kelompok as Kelompok) ? (args.kelompok as Kelompok) : "keinginan") : null;
  const catatan: string[] = [];
  if (!ada) catatan.push(`Kategori ${type === "expense" ? "pengeluaran" : "pemasukan"} ${nama} dibuat${kelompok ? ` (kelompok ${NAMA_KELOMPOK[kelompok]})` : ""}.`);
  catatan.push(`Transaksi berikutnya dari ${merchant} otomatis ${nama}.`);
  const dipakai = potong(ubah, catatan);
  const usulan: UsulanAksi = {
    kunci: kunciBaru(),
    jenis: "ubah_kategori",
    judul: `${ada ? "Ubah" : `Buat kategori ${nama} dan ubah`} ${dipakai.length} transaksi ${merchant} jadi ${nama}`,
    jumlah: dipakai.length,
    total: dipakai.reduce((n, t) => n + Number(t.amount), 0),
    baris: dipakai.map((t) => barisDari(t, k, namaKat(t.category, t.type, k), nama)),
    saldo: [],
    catatan,
    kantong: [],
    isian: {
      jenis: "ubah_kategori",
      ringkasan: `Ubah kategori ${dipakai.length} transaksi ${merchant} jadi ${nama}`,
      ...(ada ? {} : { kategori_baru: { type, nama, kelompok } }),
      ubah: dipakai.map((t) => ({ id: t.id, updated_at: t.updated_at, isian: { category: ada?.slug ?? "baru" } })),
    },
  };
  return {
    usulan,
    untukModel: untukModel(usulan, {
      merchant,
      kategori_sekarang: [...new Set(dipakai.map((t) => namaKat(t.category, t.type, k)))],
      kategori_tujuan: nama,
      kategori_baru_akan_dibuat: !ada,
    }),
  };
}

// --- usul_jadikan_pindah --------------------------------------------------------

const menit = (j: string | null | undefined) => (j ? Number(j.slice(0, 2)) * 60 + Number(j.slice(3, 5)) : null);

/** Sisi lawan yang sudah tercatat di kantong tujuan (pola cariCalonPindah §6): nominal sama, ±1 hari, menit sama bila keduanya berjam. */
export function cariGabung(calon: TxUsulan[], lawan: TxUsulan[]): Map<string, TxUsulan> {
  const terpakai = new Set<string>();
  const hasil = new Map<string, TxUsulan>();
  const urut = [...calon].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || (a.waktu ?? "").localeCompare(b.waktu ?? ""));
  for (const c of urut) {
    const g = lawan
      .filter(
        (t) =>
          !terpakai.has(t.id) &&
          t.id !== c.id &&
          (t.status ?? "confirmed") === "confirmed" &&
          !t.kantong_tujuan_id &&
          !t.induk_id &&
          !t.cicilan_id &&
          !t.pecahan_dari &&
          t.type === (c.type === "expense" ? "income" : "expense") &&
          Math.abs(Number(t.amount) - Number(c.amount)) < 0.005 &&
          Math.abs(selisihHari(t.transaction_date, c.transaction_date)) <= 1 &&
          (!c.waktu || !t.waktu || menit(c.waktu) === menit(t.waktu)),
      )
      .sort((x, y) => Math.abs(selisihHari(x.transaction_date, c.transaction_date)) - Math.abs(selisihHari(y.transaction_date, c.transaction_date)))[0];
    if (g) {
      terpakai.add(g.id);
      hasil.set(c.id, g);
    }
  }
  return hasil;
}

/**
 * Pengeluaran/pemasukan → pindah kantong ke/dari `ke_kantong`. Bila kantongnya
 * belum ada dan `buat_kantong` diisi (jenisnya), kantong itu dibuat di usulan
 * yang sama, dengan saldo awal yang membuat saldonya tidak minus (atau 0).
 * `lawan` = transaksi di kantong tujuan, calon sisi lain yang digabung.
 */
export function usulJadikanPindah(baris: TxUsulan[], lawan: TxUsulan[], args: Record<string, unknown>, k: KonteksUsulan): HasilUsulan {
  const namaKe = teksArg(args.ke_kantong, 40);
  if (!namaKe) return { untukModel: { error: "ke_kantong wajib diisi" } };
  const ke = cariKantongUsulan(namaKe, k, true);
  const jenisBaru = ke ? null : args.buat_kantong ? jenisKantongBaru(args.buat_kantong, namaKe) : null;
  if (!ke && !jenisBaru)
    return {
      untukModel: {
        error: `Kantong "${namaKe}" belum ada.`,
        kantong_yang_ada: kantongPilihan(k).filter((x) => UANG.includes(x.kind)).map((x) => x.name),
        saran: `Isi buat_kantong (bank/ewallet/tunai) supaya kantong ${namaKe} dibuat sekalian di usulan ini.`,
      },
    };
  const keId = ke?.id ?? "baru";
  const namaTujuan = ke?.name ?? namaKe;
  const catatan: string[] = [];
  const bisa = baris.filter(
    (t) =>
      t.status === "confirmed" &&
      (t.type === "expense" || t.type === "income") &&
      t.kantong_id &&
      t.kantong_id !== keId &&
      !t.kantong_tujuan_id &&
      !t.ref_bank_tujuan &&
      !t.induk_id &&
      !t.cicilan_id &&
      !t.pecahan_dari &&
      UANG.includes(k.kantong.find((x) => x.id === t.kantong_id)?.kind ?? ""),
  );
  const lewat = baris.length - bisa.length;
  if (lewat) catatan.push(`${lewat} transaksi dilewati (sudah pindah kantong, draft, ikutan/cicilan/pecahan, sudah di ${namaTujuan}, atau bukan di kantong uang).`);
  if (!bisa.length) return { untukModel: { jumlah_transaksi: 0, pesan: "Tidak ada pengeluaran/pemasukan yang bisa dijadikan pindah kantong.", ...(catatan.length ? { catatan } : {}) } };
  const dipakai = potong(bisa, catatan);
  const gabung = ke ? cariGabung(dipakai, lawan.filter((t) => t.kantong_id === ke.id)) : new Map<string, TxUsulan>();
  if (gabung.size) catatan.push(`${gabung.size} sisi lain yang sudah tercatat di ${namaTujuan} digabung jadi satu pindah kantong (yang terpisah dihapus).`);

  // Kantong baru: saldo awal supaya saldonya tidak pernah minus; berlaku sejak transaksi paling awal.
  let kantongBaru: IsianUsulan["kantong_baru"];
  if (!ke && jenisBaru) {
    const urut = [...dipakai].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || (a.waktu ?? "").localeCompare(b.waktu ?? ""));
    let jalan = 0;
    let terendah = 0;
    for (const t of urut) {
      jalan += t.type === "expense" ? Number(t.amount) : -Number(t.amount);
      terendah = Math.min(terendah, jalan);
    }
    const diminta = angkaArg(args.saldo_awal);
    const per = tanggalSah(args.per) && args.per <= k.hariIni ? args.per : urut[0].transaction_date;
    kantongBaru = { nama: namaKe, jenis: jenisBaru, saldo_awal: diminta != null && diminta >= 0 ? diminta : -terendah, saldo_sejak: saldoSejakTanggal(per) };
    catatan.unshift(`Kantong ${namaKe} (${jenisBaru === "ewallet" ? "e-wallet" : jenisBaru === "cash" ? "tunai" : "bank"}) dibuat dengan saldo awal ${rp(kantongBaru.saldo_awal)} sejak ${per}.`);
  }

  const sesudah: TxUsulan[] = [];
  const sebelumSemua: TxUsulan[] = [];
  for (const t of dipakai) {
    const g = gabung.get(t.id);
    sebelumSemua.push(t, ...(g ? [g] : []));
    sesudah.push({ ...t, type: "transfer", category: "other", kantong_id: t.type === "expense" ? t.kantong_id : keId, kantong_tujuan_id: t.type === "expense" ? keId : t.kantong_id });
  }
  const usulan: UsulanAksi = {
    kunci: kunciBaru(),
    jenis: "jadikan_pindah",
    judul: `${kantongBaru ? `Buat kantong ${namaTujuan} dan jadikan` : "Jadikan"} ${dipakai.length} transaksi pindah kantong ${dipakai.every((t) => t.type === "expense") ? "ke" : dipakai.every((t) => t.type === "income") ? "dari" : "ke/dari"} ${namaTujuan}`,
    jumlah: dipakai.length,
    total: dipakai.reduce((n, t) => n + Number(t.amount), 0),
    baris: dipakai.map((t, j) => barisDari(t, k, gambarkan(t, k) + (gabung.has(t.id) ? ` (+ sisi lain di ${namaTujuan})` : ""), gambarkan(sesudah[j], k, namaTujuan))),
    saldo: simulasiSaldo(k, sebelumSemua, sesudah, kantongBaru && { nama: kantongBaru.nama, saldo_awal: kantongBaru.saldo_awal, saldo_sejak: kantongBaru.saldo_sejak, kind: kantongBaru.jenis }),
    catatan,
    kantong: [...new Set([keId, ...dipakai.map((t) => t.kantong_id!)])],
    isian: {
      jenis: "jadikan_pindah",
      ringkasan: `Jadikan ${dipakai.length} transaksi pindah kantong ${namaTujuan}`,
      ...(kantongBaru ? { kantong_baru: kantongBaru } : {}),
      pindah: dipakai.map((t) => {
        const g = gabung.get(t.id);
        return { id: t.id, updated_at: t.updated_at, ke: keId, gabung: g ? { id: g.id, updated_at: g.updated_at } : null };
      }),
    },
  };
  return { usulan, untukModel: untukModel(usulan, kantongBaru ? { kantong_baru: { nama: kantongBaru.nama, jenis: kantongBaru.jenis, saldo_awal: kantongBaru.saldo_awal } } : {}) };
}

// --- usul_hapus -----------------------------------------------------------------

/**
 * Hapus transaksi (mis. dobel). Transaksi rekening koran hanya bila ada
 * kembarannya (jenis, nominal, kantong sama, ±1 hari) yang tidak ikut dihapus.
 * `sekitar` = transaksi tercatat di kantong & tanggal yang sama untuk mencari kembaran;
 * `dipecah` = id yang punya bagian pecahan (dihapus lewat aplikasi).
 */
export function usulHapus(baris: TxUsulan[], sekitar: TxUsulan[], dipecah: Set<string>, k: KonteksUsulan): HasilUsulan {
  if (!baris.length) return { untukModel: { jumlah_transaksi: 0, pesan: "Transaksinya tidak ditemukan (id dari hasil cari)." } };
  const catatan: string[] = [];
  const ids = new Set(baris.map((t) => t.id));
  const kembaran = (t: TxUsulan) =>
    sekitar.find(
      (v) =>
        v.id !== t.id &&
        !ids.has(v.id) &&
        (v.status ?? "confirmed") === "confirmed" &&
        v.type === t.type &&
        Math.abs(Number(v.amount) - Number(t.amount)) < 0.005 &&
        v.kantong_id === t.kantong_id &&
        Math.abs(selisihHari(v.transaction_date, t.transaction_date)) <= 1,
    );
  const bank = baris.filter((t) => (t.ref_bank || t.ref_bank_tujuan) && !kembaran(t));
  const pecah = baris.filter((t) => dipecah.has(t.id));
  if (bank.length) catatan.push(`${bank.length} transaksi dari rekening koran tidak dihapus karena tidak ada kembarannya (angka bank).`);
  if (pecah.length) catatan.push(`${pecah.length} transaksi yang sudah dipecah dihapus lewat aplikasi.`);
  const lewat = new Set([...bank, ...pecah].map((t) => t.id));
  const dipakai = potong(
    baris.filter((t) => !lewat.has(t.id)),
    catatan,
  );
  if (!dipakai.length) return { untukModel: { jumlah_transaksi: 0, pesan: "Tidak ada yang bisa dihapus.", catatan } };
  const usulan: UsulanAksi = {
    kunci: kunciBaru(),
    jenis: "hapus",
    judul: `Hapus ${dipakai.length} transaksi`,
    jumlah: dipakai.length,
    total: dipakai.reduce((n, t) => n + Number(t.amount), 0),
    baris: dipakai.map((t) => {
      const kembar = kembaran(t);
      return barisDari(t, k, gambarkan(t, k), kembar ? `Dihapus (kembarannya tetap: ${teksTx(kembar, k)}, ${kembar.transaction_date})` : "Dihapus");
    }),
    saldo: simulasiSaldo(k, dipakai, []),
    catatan,
    kantong: [...new Set(dipakai.flatMap((t) => [t.kantong_id, t.kantong_tujuan_id]).filter((x): x is string => Boolean(x)))],
    isian: { jenis: "hapus", ringkasan: `Hapus ${dipakai.length} transaksi`, hapus: dipakai.map((t) => ({ id: t.id, updated_at: t.updated_at })) },
  };
  return { usulan, untukModel: untukModel(usulan) };
}

// --- usul_selesaikan_draft ------------------------------------------------------

export function usulSelesaikanDraft(t: TxUsulan | null, args: Record<string, unknown>, k: KonteksUsulan): HasilUsulan {
  if (!t || t.status !== "needs_review" || t.induk_id) return { untukModel: { error: "Draft-nya tidak ditemukan (id dari cari dengan status draft, atau cari_kejanggalan)." } };
  if (t.cicilan_id) return { untukModel: { error: "Draft bayar cicilan diselesaikan di aplikasi (Belum selesai di Beranda)." } };
  if (!(Number(t.amount) > 0)) return { untukModel: { error: "Nominal draft ini belum terbaca; pengguna perlu melengkapinya di aplikasi." } };
  const i = (args.isian && typeof args.isian === "object" ? args.isian : args) as Record<string, unknown>;
  const isian: Record<string, string | null> = {};
  for (const [kunci, kolom] of [
    ["kantong", "kantong_id"],
    ["kantong_tujuan", "kantong_tujuan_id"],
  ] as const) {
    const nama = teksArg(i[kunci], 60);
    if (!nama) continue;
    if (kolom === "kantong_tujuan_id" && t.type !== "transfer") continue;
    const x = cariKantongUsulan(nama, k);
    if (!x) return { untukModel: { error: `Kantong "${nama}" tidak ada.`, kantong_yang_ada: kantongPilihan(k).map((y) => y.name) } };
    isian[kolom] = x.id;
  }
  const jam = jamArg(i.jam);
  if (jam) isian.waktu = jam;
  const sesudah = { ...t, ...isian, status: "confirmed" } as TxUsulan;
  if (!sesudah.kantong_id) return { untukModel: { error: "Kantong draft ini belum diisi: tanya pengguna pakai kantong apa, lalu isi isian.kantong." } };
  if (t.type === "transfer" && (!sesudah.kantong_tujuan_id || sesudah.kantong_tujuan_id === sesudah.kantong_id))
    return { untukModel: { error: "Draft pindah kantong butuh kantong tujuan yang berbeda: isi isian.kantong_tujuan." } };
  const usulan: UsulanAksi = {
    kunci: kunciBaru(),
    jenis: "selesaikan_draft",
    judul: `Simpan draft ${teksTx(t, k)}`,
    jumlah: 1,
    total: Number(t.amount),
    baris: [barisDari(t, k, gambarkan(t, k), gambarkan(sesudah, k) + (jam ? ` · jam ${jam}` : ""))],
    saldo: simulasiSaldo(k, [t], [sesudah]),
    catatan: [],
    kantong: [sesudah.kantong_id, sesudah.kantong_tujuan_id].filter((x): x is string => Boolean(x)),
    isian: { jenis: "selesaikan_draft", ringkasan: `Simpan draft ${teksTx(t, k)}`, draft: [{ id: t.id, updated_at: t.updated_at, isian }] },
  };
  return { usulan, untukModel: untukModel(usulan) };
}

// --- usul_catat -----------------------------------------------------------------

const JENIS_CATAT: Record<string, "expense" | "income" | "transfer"> = { keluar: "expense", pengeluaran: "expense", masuk: "income", pemasukan: "income", pindah: "transfer" };

/** Catat transaksi baru dari ketikan ("tadi makan 25rb pakai DANA"). `teks` = pertanyaan user, untuk "Cara dicatat". */
export function usulCatat(args: Record<string, unknown>, k: KonteksUsulan, teks: string): HasilUsulan {
  const type = JENIS_CATAT[String(args.jenis ?? "keluar").toLowerCase()] ?? null;
  if (!type) return { untukModel: { error: "jenis harus keluar, masuk, atau pindah" } };
  const nominal = angkaArg(args.nominal);
  if (nominal == null || !(nominal > 0) || nominal > 1e12) return { untukModel: { error: "nominal wajib diisi dan lebih dari 0" } };
  const kantong = cariKantongUsulan(args.kantong, k);
  if (!kantong) return { untukModel: { error: args.kantong ? `Kantong "${String(args.kantong).slice(0, 40)}" tidak ada.` : "Kantongnya belum disebut: tanya pengguna pakai kantong apa.", kantong_yang_ada: kantongPilihan(k).map((x) => x.name) } };
  const tujuan = type === "transfer" ? cariKantongUsulan(args.kantong_tujuan, k) : null;
  if (type === "transfer" && (!tujuan || tujuan.id === kantong.id)) return { untukModel: { error: "Pindah kantong butuh kantong_tujuan yang ada dan berbeda.", kantong_yang_ada: kantongPilihan(k).map((x) => x.name) } };
  let kategori = type === "transfer" ? null : cariKategoriUsulan(args.kategori, type, k);
  const catatan: string[] = [];
  if (type !== "transfer" && !kategori) {
    if (args.kategori) catatan.push(`Kategori "${String(args.kategori).slice(0, 30)}" tidak ada; dicatat sebagai Lainnya.`);
    kategori = k.kategori.find((c) => c.type === type && c.slug === "other") ?? null;
  }
  const tanggal = tanggalSah(args.tanggal) && args.tanggal <= k.hariIni ? args.tanggal : k.hariIni;
  const jam = jamArg(args.jam);
  const merchant = teksArg(args.merchant, 100);
  const keterangan = teksArg(args.keterangan, 500);
  const baru: TxUsulan = {
    id: "",
    amount: nominal,
    type,
    status: "confirmed",
    category: kategori?.slug ?? "other",
    merchant,
    description: keterangan,
    kantong_id: kantong.id,
    kantong_tujuan_id: tujuan?.id ?? null,
    transaction_date: tanggal,
    waktu: jam,
    updated_at: "",
  };
  const label = type === "expense" ? "pengeluaran" : type === "income" ? "pemasukan" : "pindah kantong";
  const usulan: UsulanAksi = {
    kunci: kunciBaru(),
    jenis: "catat",
    judul: `Catat ${label} ${merchant ?? (type === "transfer" ? "" : kategori?.name ?? "")} ${rp(nominal)}`.replace(/\s+/g, " "),
    jumlah: 1,
    total: nominal,
    baris: [{ id: null, tanggal, teks: merchant ?? keterangan ?? (type === "transfer" ? "Pindah kantong" : (kategori?.name ?? "Lainnya")), nominal, sebelum: null, sesudah: gambarkan(baru, k) + (jam ? ` · jam ${jam}` : "") }],
    saldo: simulasiSaldo(k, [], [baru]),
    catatan,
    kantong: [kantong.id, ...(tujuan ? [tujuan.id] : [])],
    isian: {
      jenis: "catat",
      ringkasan: `Catat ${label} ${rp(nominal)}`,
      sisip: [
        {
          type,
          amount: nominal,
          category: kategori?.slug ?? "other",
          merchant,
          description: keterangan,
          kantong_id: kantong.id,
          kantong_tujuan_id: tujuan?.id ?? null,
          transaction_date: tanggal,
          waktu: jam,
          teks: teks.slice(0, 300),
        },
      ],
    },
  };
  return { usulan, untukModel: untukModel(usulan) };
}
