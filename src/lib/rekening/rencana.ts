import { cocokkanKantong, normal } from "@/lib/kantong";
import { kantongBank, namaSama } from "@/lib/arah";
import { ingatKategori, type BarisIngat } from "@/lib/ingat";
import { emojiJenis, namaEwallet, namaLembaga, tebakJenisKantong } from "@/lib/lembaga";
import { bakukanPaylater, penyediaPaylater } from "@/lib/paylater-nama";
import { jatuhTempoKe, keteranganCicilan, type Cicilan } from "@/lib/pinjaman";
import { bersihkanMerchant, kategoriLayanan } from "@/lib/rekening/merchant";
import { namaRekening } from "@/lib/rekening/baca";
import { NAMA_BANK, type Bank, type BarisBank, type DepositoBank, type HasilBaca, type RekeningBank } from "@/lib/rekening/jenis";
import { empatAkhir, selisihHari, sen } from "@/lib/rekening/teks";
import {
  hitungBunga,
  pajakBawaan,
  patokanDeposito,
  periodeDeposito,
  tambahBulan,
  tambahHari,
  tglPanjang,
  type Deposito,
  type IsianPeriode,
  type Perpanjangan,
  type PeriodeDeposito,
  type SatuanTenor,
} from "@/lib/simpanan";
import { ikutSaldo, saldoSejak, type SaldoSejak } from "@/lib/waktu";
import { fmtIDR } from "@/lib/format";

/**
 * Rekening koran yang sudah dibaca → rencana impor (spec §3–§8), fungsi
 * murni: transaksi baru, baris yang sudah tercatat (ditautkan), pindah
 * kantong antar rekening sendiri, bunga bulanan, kantong/simpanan/deposito
 * yang dibuat, dan perbandingan saldo. Pratinjau dan impor memakai fungsi
 * yang sama dengan masukan yang sama, jadi yang disimpan = yang dilihat.
 */

// ---------------------------------------------------------------- masukan

export interface KantongRencana {
  id: string;
  name: string;
  kind: string;
  nomor_akhir?: string | null;
  induk_id?: string | null;
  macam_simpanan?: string | null;
  aliases?: string[] | null;
  saldo_awal?: number | string;
  saldo_per?: string;
  saldo_sejak?: string | null;
  /**
   * Dibuat di tempat (A-1/A-2) dan saldonya belum diisi user (U1): rekening koran pertama
   * banknya sendiri mengisi saldo awal (saldo awal bank, sejak awal periode).
   */
  saldo_sementara?: boolean | null;
}

/** Transaksi tercatat yang sudah ada (cukup kolom yang dipakai di sini). */
export interface TransaksiLama {
  id: string;
  amount: number | string;
  type: string;
  category?: string | null;
  merchant?: string | null;
  kantong_id: string | null;
  kantong_tujuan_id: string | null;
  transaction_date: string;
  waktu?: string | null;
  ref_bank?: string | null;
  ref_bank_tujuan?: string | null;
  induk_id?: string | null;
  created_at?: string;
  description?: string | null;
  /** "statement" = dari rekening koran. */
  source?: string | null;
}

/** Pengeluaran/pemasukan rekening koran yang ternyata pindah antar kantong sendiri (temuan UAT R2). */
export interface UbahPindah {
  id: string;
  kantong_id: RujukanKantong;
  kantong_tujuan_id: RujukanKantong;
  ref_bank: string | null;
  ref_bank_tujuan: string | null;
  merchant: string;
}

/** Periode deposito yang sudah tersimpan (SPEC-deposito-jatuh-tempo). */
export type PeriodeRencana = Pick<PeriodeDeposito, "id" | "ke" | "mulai" | "jatuh_tempo" | "pokok" | "bunga_kotor" | "pajak" | "bunga_bersih" | "bunga_diterima" | "dicairkan_awal"> & {
  /** Transaksi yang dibuat saat periode ini ditutup (evaluasi atau rekening koran). */
  transaksi_tutup?: string[] | null;
};

/** Deposito user beserta periodenya (yang selesai juga, untuk menautkan pencairannya). */
export type DepositoRencana = Pick<Deposito, "kantong_id" | "bunga_persen" | "tenor" | "satuan_tenor" | "pajak_persen" | "pajak_otomatis" | "perpanjangan" | "selesai"> & {
  name: string;
  induk_id: string | null;
  periode: PeriodeRencana[];
};

/** Isian "Jadikan deposito?" untuk kantong Jago bernama Deposito (K2). */
export interface IsianJadikan {
  tenor: number;
  satuan_tenor: SatuanTenor;
  bunga_persen: number;
  perpanjangan: Perpanjangan;
  /** Tanggal mulai bila baris Penempatan Dana tidak ada di rekening koran. */
  mulai?: string;
}

/** Jawaban user di pratinjau. */
export interface Pilihan {
  /** Kunci rekening → id kantong, atau "baru" (Buat kantong SeaBank). */
  peta?: Record<string, string>;
  /** Baris yang ragu (ref) → id transaksi lama, atau "baru". */
  ragu?: Record<string, string>;
  /** Kunci tawaran deposito yang diterima. */
  deposito?: string[];
  /** Kunci rekening yang saldo awal kantongnya disamakan (K4). */
  samakan?: string[];
  /** Kunci rekening kantong Jago → isian deposito (SPEC-deposito-jatuh-tempo K2). */
  jadikan?: Record<string, IsianJadikan>;
  /** Kunci tawaran kantong baru yang TIDAK dicentang (SPEC-kantong-sendiri A-2/D-3); bawaannya tercentang. */
  tolakKantong?: string[];
  /**
   * Pengenal baris (ref) yang tidak dicentang di rincian pratinjau (SPEC-periksa-dulu §3):
   * tidak diimpor dan tidak diingat — impor ulang menawarkannya lagi sebagai baris baru.
   */
  kecuali?: string[];
}

/** Baris rekening koran yang dibaca (untuk rincian pratinjau, SPEC-periksa-dulu §3). */
export interface BarisRincianBank {
  ref: string;
  kunciRek: string;
  tanggal: string;
  jam: string | null;
  uraian: string;
  nominal: number;
}

/** Rencana cicilan beserta nomor cicilan yang sudah dibayar (SPEC-kantong-sendiri D-3). */
export type CicilanRencana = Pick<Cicilan, "id" | "nama" | "penyedia" | "category" | "tenor" | "jatuh_tempo_awal" | "nominal"> & { dibayar: number[] };

export interface MasukanRencana {
  bacaan: HasilBaca[];
  /** Semua kantong user (deposito yang sudah selesai tidak perlu ikut). */
  kantong: KantongRencana[];
  /** Transaksi tercatat di kantong yang terlibat, sejak sehari sebelum periode paling awal. */
  transaksi: TransaksiLama[];
  /** Kategori user (type + slug); null = anggap semua kategori bawaan ada. */
  kategori: { type: string; slug: string }[] | null;
  /** ref_bank / ref_bank_tujuan yang sudah tersimpan. */
  sudahAda: Set<string>;
  pilihan?: Pilihan;
  /** Deposito & periodenya; tanpa ini jatuh tempo tidak dicocokkan. */
  deposito?: DepositoRencana[];
  /**
   * Saldo tiap kantong sekarang (RPC saldo_kantong), untuk saldo akhir periode di
   * pratinjau: `transaksi` hanya sejak sehari sebelum periode, yang lebih lama
   * terhitung lewat angka ini (temuan UAT R1).
   */
  saldoSekarang?: Record<string, number>;
  /**
   * Ingatan kategori (SPEC-kantong-sendiri C-1): transaksi terkonfirmasi setahun
   * terakhir, terbaru dulu (bentuk ingatKategori). Tanpa ini tidak ada yang diingat.
   */
  ingatan?: BarisIngat[];
  /** Nama user di rekening/dompetnya (user_metadata.nama_rekening, B-1): tanda rekening sendiri selain pemilik rekening koran. */
  namaUser?: string[];
  /** Rencana cicilan user (D-3): bayar tagihan paylater ditautkan ke cicilannya. */
  cicilan?: CicilanRencana[];
}

// ---------------------------------------------------------------- keluaran

/** Kantong: id yang ada, atau kunci "baru:…" untuk yang dibuat saat impor. */
export type RujukanKantong = string;

export interface TxBaru {
  kunci: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  category: string | null;
  merchant: string | null;
  description: string | null;
  transaction_date: string;
  waktu: string | null;
  kantong_id: RujukanKantong;
  kantong_tujuan_id: RujukanKantong | null;
  /** Kunci TxBaru induknya (biaya transfer yang menempel). */
  induk: string | null;
  ref_bank: string | null;
  ref_bank_tujuan: string | null;
  perlu_dilengkapi: boolean;
  /** Bayar cicilan (D-3): rencana & nomor cicilannya. */
  cicilan_id?: string | null;
  cicilan_ke?: number | null;
  /** Kelompok dari ingatan kategori (C-1); null = bawaan kategorinya. */
  kelompok?: string | null;
  /**
   * Posisi baris di rekening koran (urut tanggal, lalu urutan baris): jadi
   * selisih created_at saat disimpan, supaya urutan baris tanpa jam (SeaBank)
   * tetap diketahui untuk mencocokkan screenshot/struk (SPEC-lengkapi §1).
   */
  urut?: number;
}

export interface KantongBaru {
  kunci: string;
  name: string;
  emoji: string;
  kind: "bank" | "simpanan" | "ewallet" | "kredit";
  induk_id: RujukanKantong | null;
  macam_simpanan: "tabungan" | null;
  saldo_awal: number;
  /** null = sekarang (saat impor). */
  saldo_sejak: string | null;
  nomor_akhir: string;
  /** Dibuat di tempat tanpa rekening koran (A-2/D-3): saldo Rp 0 sejak transaksi pertamanya, sesudah impor ditanya saldonya (K1). */
  tanyaSaldo?: boolean;
}

/** Tawaran kantong untuk e-wallet/bank/paylater milik sendiri yang belum ada (A-2, D-3). */
export interface TawaranKantong {
  kunci: string;
  name: string;
  kind: "bank" | "ewallet" | "kredit";
  /** Jumlah baris yang jadi pindah kantong bila diterima. */
  n: number;
  /** "Kantong baru DANA (3 top up dari BRI)" */
  teks: string;
  dipilih: boolean;
}

export interface TawaranDeposito {
  kunci: string;
  induk_id: RujukanKantong;
  name: string;
  pokok: number;
  bunga_persen: number;
  tenor: number;
  satuan_tenor: "hari" | "bulan";
  pajak_persen: number;
  mulai: string;
  jatuh_tempo: string;
  bunga_kotor: number;
  pajak: number;
  bunga_bersih: number;
  /** "Buat deposito Promo 3 bulan, 6%, Rp 5 jt?" */
  teks: string;
  /**
   * Tanggal penempatan yang tercatat sebagai pindah kantong ke deposito ini
   * (diisi bila diterima): deposito dibuat bersaldo 0 sejak tanggal itu dan
   * diisi oleh pindah kantongnya. null = uang baru, saldo = pokok sejak saat impor.
   */
  didanai?: string | null;
}

/** Tawaran "Jadikan deposito?" untuk kantong Jago bernama Deposito (K2). */
export interface TawaranJadikan {
  /** Kunci rekening kantong Jago-nya. */
  kunci: string;
  kantong: RujukanKantong;
  name: string;
  /** Tanggal & nominal baris Penempatan Dana; null bila tidak ada di rekening koran ini. */
  mulai: string | null;
  pokok: number | null;
  teks: string;
  /** Isian yang sedang berlaku (diterima), atau null. */
  isian: IsianJadikan | null;
  galat: string | null;
}

/** Isian periode deposito baru (kunci = rujukan sementara sampai disimpan). */
export type PeriodeBaru = Omit<IsianPeriode, "hari"> & { kunci: string };

/** Periode yang belum dicek, ditutup dari baris rekening koran (§1). */
export interface TutupRekening {
  /** Id periode, atau kunci periode baru dari rencana yang sama. */
  periode: string;
  deposito: RujukanKantong;
  /** Bunga bersih menurut bank. */
  bunga: number;
  cair: boolean;
  /** Transaksi hasilnya (kunci TxBaru atau id transaksi lama) → transaksi_tutup. */
  transaksi: string[];
  /** Periode perpanjangan; null bila cair. */
  baru: PeriodeBaru | null;
}

/** Periode yang sudah dievaluasi di aplikasi tapi bunganya beda dengan bank (K1). */
export interface SesuaikanPeriode {
  periode: string;
  bunga: number;
  /** Transaksi bunga hasil evaluasi, diubah ke nominal bank. */
  transaksi: { id: string; amount: number; description: string } | null;
  /** Transaksi bunga baru (evaluasi Rp 0, bank memberi bunga): kunci TxBaru. */
  tambah: string | null;
  /** Periode perpanjangan yang belum dicek: pokok & perkiraannya dihitung ulang. */
  berikut: { id: string; pokok: number; bunga_kotor: number; pajak: number; bunga_bersih: number } | null;
  /** Hasil evaluasi (bunga, pencairan) yang tanggal/jamnya diubah ke tanggal baris bank. */
  tanggal?: { id: string; transaction_date: string; waktu: string | null }[];
}

/** Kantong Jago yang dijadikan deposito (K2). */
export interface JadikanDeposito {
  kantong_id: RujukanKantong;
  bunga_persen: number;
  tenor: number;
  satuan_tenor: SatuanTenor;
  pajak_persen: number;
  perpanjangan: Perpanjangan;
  periode: PeriodeBaru;
}

export interface Ragu {
  ref: string;
  rekening: string;
  tanggal: string;
  nominal: number;
  uraian: string;
  kandidat: { id: string; label: string }[];
  /** Pilihan yang berlaku (bawaan: kandidat pertama). */
  dipilih: string;
}

export interface RingkasRekening {
  kunci: string;
  nama: string;
  bank: Bank;
  nomorAkhir: string;
  saku: string | null;
  utama: boolean;
  /** Kantong tujuan (id atau kunci baru); null = belum dipetakan. */
  kantong: RujukanKantong | null;
  namaKantong: string | null;
  dari: string;
  sampai: string;
  berkas: number;
  baris: number;
  baru: number;
  tercatat: number;
  pindah: number;
  /** Baris bunga/pajak yang digabung, dan jumlah transaksi bunga bulanannya. */
  barisBunga: number;
  bunga: number;
  perluDilengkapi: number;
  /** Transaksi baru yang kategorinya dari ingatan (C-1): "· 2 berkategori dari bulan lalu". */
  dariIngatan: number;
  /** Baris bayar paylater yang ditautkan ke rencana cicilan (D-3). */
  cicilan: number;
  saldoBank: number;
  /** Saldo kantong di akhir periode menurut aplikasi sesudah impor; null bila belum dipetakan. */
  saldoAplikasi: number | null;
  /** U1: saldo awal kantong yang dibuat di tempat diambil dari rekening koran ini ("Saldo awal SeaBank diambil dari rekening koran ini"). */
  saldoDariRekening: boolean;
  /** Tawaran K4 bila beda. */
  samakan: { saldo_awal: number; saldo_sejak: string; teks: string } | null;
  /** Transaksi di kantong lain yang diubah jadi pindah kantong dengan rekening ini (R2): "2 transaksi di Jago …". */
  diubahPindah: { nama: string; n: number }[];
  /** Deposito yang jatuh tempo di rekening koran ini; `peringatan` = bunga beda dengan perkiraan/isian. */
  deposito: { teks: string; peringatan: boolean; judul?: string }[];
}

export interface Rencana {
  rekening: RingkasRekening[];
  /** Rekening yang belum punya kantong; yang ditanyakan hanya `utama` (kantong Jago lain ikut Jago-nya). */
  belumDipetakan: { kunci: string; nama: string; bank: Bank; nomorAkhir: string; utama: boolean }[];
  kantongBaru: KantongBaru[];
  nomorAkhir: { id: string; nomor_akhir: string }[];
  tawaranDeposito: TawaranDeposito[];
  /** Kantong e-wallet/bank/paylater sendiri yang belum ada (A-2, D-3); yang dipilih ada di kantongBaru. */
  tawaranKantong: TawaranKantong[];
  /** Tawaran deposito yang diterima: dibuat saat impor. */
  depositoBaru: TawaranDeposito[];
  saldo: { kantong_id: RujukanKantong; saldo_awal: number; saldo_sejak: string }[];
  sisip: TxBaru[];
  tautkan: { id: string; ref_bank?: string; ref_bank_tujuan?: string }[];
  perbarui: { id: string; amount: number; description: string }[];
  /** Pengeluaran penempatan deposito dari impor sebelumnya → pindah kantong ke depositonya. */
  jadiPindah: { id: string; kantong_tujuan_id: RujukanKantong; merchant: string }[];
  /** Pengeluaran/pemasukan di kantong lain yang ternyata pindah kantong dengan rekening ini (R2). */
  ubahPindah: UbahPindah[];
  /** Pengeluaran penempatan yang sudah diganti pindah kantong pembuatan deposito (K3): dihapus. */
  hapus: string[];
  tawaranJadikan: TawaranJadikan[];
  jadikan: JadikanDeposito[];
  tutup: TutupRekening[];
  sesuaikan: SesuaikanPeriode[];
  ragu: Ragu[];
  /** Semua baris yang dibaca (tanpa dobel antar-berkas), untuk rincian pratinjau. */
  barisBank: BarisRincianBank[];
  /** Kunci TxBaru yang kategorinya dari ingatan (C-1). */
  dariIngatan: string[];
  /** Baris yang dipakai deposito jatuh tempo (tidak bisa dikecualikan satu per satu). */
  refDeposito: string[];
  ringkas: {
    baris: number;
    dobel: number;
    baru: number;
    tercatat: number;
    pindah: number;
    pasangan: number;
    antarJago: number;
    barisBunga: number;
    bunga: number;
    perluDilengkapi: number;
    dariIngatan: number;
    cicilan: number;
    ikutan: number;
    perKategori: Record<string, number>;
  };
}

// ---------------------------------------------------------------- aturan

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const labelBulan = (ym: string) => `${BULAN_PENDEK[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** Golongan baris menurut aturan per jenis baris (spec §4), tanpa AI. */
export type Golongan =
  | "bunga"
  | "pajak"
  | "biaya"
  | "refund"
  | "bayar" // pembayaran via e-wallet/QRIS/merchant: Lainnya, perlu dilengkapi
  | "transfer" // ke/dari orang, atau ke rekening sendiri bila dikenali
  | "antarJago"
  | "deposito"
  | "penyesuaian"
  | "lain";

export function golongkan(b: BarisBank, bank: Bank): Golongan {
  const u = b.uraian;
  const nama = b.pihak?.nama ?? "";
  if (bank === "seabank") {
    if (/^Refund\b/i.test(nama)) return "refund";
    // Biaya top up/transfer: pihaknya "Fee", jenisnya jenis transaksi induknya.
    if (/^(Fee|Biaya)\b/i.test(nama)) return "biaya";
    switch (b.jenis) {
      case "Interest":
        return "bunga";
      case "Tax":
        return "pajak";
      case "Fee":
        return "biaya";
      case "Refund":
        return "refund";
      case "Payment":
        return "bayar";
      case "Transfer":
      case "Top Up - eWallet":
      case "Withdrawal":
        return "transfer";
      case "Time Deposit":
        return "deposito";
      case "Adjustment":
        return "penyesuaian";
    }
    return "lain";
  }
  if (bank === "jago") {
    const j = b.jenis ?? "";
    if (/^(Pindah uang antar Kantong|Penempatan Dana Pokok|Pencairan Dana Pokok)$/i.test(j)) return "antarJago";
    if (/^Bunga\b/i.test(j)) return "bunga";
    if (/^Pajak\b/i.test(j)) return "pajak";
    if (/^(Biaya|Admin)/i.test(j)) return "biaya";
    // Cashback, refund, dan pembatalan transaksi kartu/QRIS ("QRD01-R", "PSD02-R").
    if (/^(Cashback|Refund|Pengembalian)/i.test(j) || (/^\w+-R\b/.test(j) && b.nominal > 0)) return "refund";
    if (/^(Transfer (Masuk|Keluar)|Isi Saldo|Tarik Saldo|Pencairan Dana dari)/i.test(j)) return "transfer";
    if (/^(Pembayaran|Transaksi POS|Pembelian)/i.test(j) || /^\w+-R\b/.test(j)) return "bayar";
    return "lain";
  }
  // BRI
  if (/^(Admin Fee|Monthly Fee|Biaya)/i.test(u)) return "biaya";
  if (/^Bunga/i.test(u)) return "bunga";
  if (/^Pajak/i.test(u)) return "pajak";
  if (/^(Transfer|TRF|Top Up)/i.test(u)) return "transfer";
  if (/^(QRIS|Pembayaran|Pembelian)/i.test(u)) return "bayar";
  return "lain";
}

/** Nama pihak = pemilik rekening? Huruf tersamar "X" dan kata terakhir yang terpotong dianggap cocok. */
export function samaPemilik(nama: string | null | undefined, pemilik: string | null | undefined): boolean {
  if (!nama || !pemilik) return false;
  const kata = (s: string) => s.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
  const a = kata(nama);
  const b = kata(pemilik);
  if (a.length < 2 || a.length > b.length) return false;
  return a.every((k, i) => {
    const p = b[i];
    if (k.length > p.length) return false;
    if (k.length < p.length && i !== a.length - 1) return false; // hanya kata terakhir boleh terpotong
    return [...k].every((c, j) => c === "X" || c === p[j]);
  });
}

// ---------------------------------------------------------------- rencana

interface BarisKerja extends BarisBank {
  rek: RekeningBank;
  kunciRek: string;
  pemilik: string | null;
  kantong: RujukanKantong | null;
  gol: Golongan;
  selesai: boolean;
}

const kunciRekening = (r: Pick<RekeningBank, "bank" | "nomorAkhir">) => `${r.bank}:${r.nomorAkhir}`;
const KANTONG_UANG = new Set(["bank", "ewallet", "cash"]);
/** Baris top up / isi saldo e-wallet (U3), bukan pembayaran lewat e-wallet. */
const TOP_UP = /\btop\s*-?\s*up\b|\bisi\s+saldo\b/i;
const sama = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b) && normal(a!) === normal(b!);
const menit = (j: string | null | undefined) => (j ? Number(j.slice(0, 2)) * 60 + Number(j.slice(3, 5)) : null);

export function rencanakan(m: MasukanRencana): Rencana {
  const pilihan = m.pilihan ?? {};
  const kantong = [...m.kantong];
  const kantongBaru: KantongBaru[] = [];
  const nomorAkhir = new Map<string, string>();
  const namaDipakai = new Set(kantong.map((k) => k.name.trim().toLowerCase()));
  const namaUnik = (nama: string, cadangan: string) => {
    const n = namaDipakai.has(nama.toLowerCase()) ? cadangan : nama;
    namaDipakai.add(n.toLowerCase());
    return n;
  };
  const cariKantong = (id: string | null) => (id ? (kantong.find((k) => k.id === id) ?? null) : null);

  // 1. Rekening (digabung antar-berkas per nomor) & baris unik (ref).
  interface Rek {
    kunci: string;
    contoh: RekeningBank;
    semua: RekeningBank[];
    pemilik: string | null;
  }
  const rekMap = new Map<string, Rek>();
  for (const h of m.bacaan)
    for (const r of h.rekening) {
      const k = kunciRekening(r);
      const ada = rekMap.get(k);
      if (ada) {
        ada.semua.push(r);
        ada.pemilik ??= h.pemilik;
      } else rekMap.set(k, { kunci: k, contoh: r, semua: [r], pemilik: h.pemilik });
    }
  const daftarRek = [...rekMap.values()];
  const rekJagoUtama = daftarRek.find((r) => r.contoh.bank === "jago" && r.contoh.utama);

  // 2. Rekening → kantong. Rekening utama: nomor_akhir, atau jawaban user.
  //    Kantong Jago lain: simpanan di dalam kantong Jago (K1), dibuat bila belum ada.
  const petaRek = new Map<string, RujukanKantong>();
  const belumDipetakan: Rencana["belumDipetakan"] = [];
  for (const r of daftarRek.filter((x) => x.contoh.utama)) {
    const c = r.contoh;
    const jawab = pilihan.peta?.[r.kunci];
    let id: string | null = null;
    if (jawab && jawab !== "baru" && kantong.some((k) => k.id === jawab && KANTONG_UANG.has(k.kind))) id = jawab;
    if (!jawab) id = kantong.find((k) => k.nomor_akhir === c.nomorAkhir && KANTONG_UANG.has(k.kind))?.id ?? null;
    // E-3 (SPEC-kantong-sendiri): satu-satunya kantong bank bernama sama yang belum punya
    // nomor_akhir (mis. dibuat di layar awal) → dipetakan otomatis, nomornya diingat. Hanya
    // bila rekening bank itu yang belum dikenal di impor ini juga cuma satu.
    if (!jawab && !id) {
      const calon = kantong.filter((k) => k.kind === "bank" && !k.nomor_akhir && cocokkanKantong(NAMA_BANK[c.bank], [k]) && ![...petaRek.values()].includes(k.id));
      const belumKenal = daftarRek.filter((x) => x.contoh.utama && x.contoh.bank === c.bank && !kantong.some((k) => k.nomor_akhir === x.contoh.nomorAkhir && KANTONG_UANG.has(k.kind)));
      if (calon.length === 1 && belumKenal.length === 1) id = calon[0].id;
    }
    if (jawab === "baru") {
      const kunci = `baru:${r.kunci}`;
      const awal = [...r.semua].sort((a, b) => a.dari.localeCompare(b.dari))[0];
      kantongBaru.push({
        kunci,
        name: namaUnik(NAMA_BANK[c.bank], `${NAMA_BANK[c.bank]} …${c.nomorAkhir}`),
        emoji: "🏦",
        kind: "bank",
        induk_id: null,
        macam_simpanan: null,
        saldo_awal: awal.saldoAwal,
        saldo_sejak: `${awal.dari}T00:00:00+07:00`,
        nomor_akhir: c.nomorAkhir,
      });
      petaRek.set(r.kunci, kunci);
    } else if (id) {
      petaRek.set(r.kunci, id);
      if (cariKantong(id)?.nomor_akhir !== c.nomorAkhir) nomorAkhir.set(id, c.nomorAkhir);
    } else belumDipetakan.push({ kunci: r.kunci, nama: namaRekening(c), bank: c.bank, nomorAkhir: c.nomorAkhir, utama: c.utama });
  }
  const indukJago = rekJagoUtama ? (petaRek.get(rekJagoUtama.kunci) ?? null) : null;
  const simpananJago = (nama: string, nomor: string | null): RujukanKantong | null => {
    if (!indukJago) return null;
    const ada = kantong.find((k) => k.kind === "simpanan" && k.induk_id === indukJago && ((nomor && k.nomor_akhir === nomor) || sama(k.name, nama)));
    if (ada) return ada.id;
    const baru = kantongBaru.find((k) => k.induk_id === indukJago && (k.nomor_akhir === nomor || sama(k.name, nama)));
    return baru?.kunci ?? null;
  };
  for (const r of daftarRek.filter((x) => !x.contoh.utama)) {
    const c = r.contoh;
    if (!indukJago) {
      belumDipetakan.push({ kunci: r.kunci, nama: namaRekening(c), bank: c.bank, nomorAkhir: c.nomorAkhir, utama: c.utama });
      continue;
    }
    const nama = c.saku ?? `Kantong …${c.nomorAkhir}`;
    let id = simpananJago(nama, c.nomorAkhir);
    const kosong = r.semua.every((x) => !x.baris.length && x.saldoAkhir === 0);
    if (!id && !kosong) {
      const awal = [...r.semua].sort((a, b) => a.dari.localeCompare(b.dari))[0];
      id = `baru:${r.kunci}`;
      kantongBaru.push({
        kunci: id,
        name: namaUnik(nama, `${nama} (Jago)`),
        emoji: "🐷",
        kind: "simpanan",
        induk_id: indukJago,
        macam_simpanan: "tabungan",
        saldo_awal: awal.saldoAwal,
        saldo_sejak: `${awal.dari}T00:00:00+07:00`,
        nomor_akhir: c.nomorAkhir,
      });
    } else if (id && !id.startsWith("baru:") && cariKantong(id)?.nomor_akhir !== c.nomorAkhir) nomorAkhir.set(id, c.nomorAkhir);
    if (id) petaRek.set(r.kunci, id);
  }

  // Baris unik (berkas tumpang tindih: Jago riwayat vs bulanan, file sama dua kali).
  const lihat = new Set<string>();
  let dobel = 0;
  const kerja: BarisKerja[] = [];
  for (const r of daftarRek)
    for (const rek of [...r.semua].sort((a, b) => a.dari.localeCompare(b.dari)))
      for (const b of rek.baris) {
        if (lihat.has(b.ref)) {
          dobel++;
          continue;
        }
        lihat.add(b.ref);
        kerja.push({ ...b, rek, kunciRek: r.kunci, pemilik: r.pemilik, kantong: petaRek.get(r.kunci) ?? null, gol: golongkan(b, rek.bank), selesai: false });
      }

  // Ringkasan per rekening.
  const ringkas = new Map<string, RingkasRekening>();
  for (const r of daftarRek) {
    const urut = [...r.semua].sort((a, b) => a.dari.localeCompare(b.dari) || a.sampai.localeCompare(b.sampai));
    const id = petaRek.get(r.kunci) ?? null;
    ringkas.set(r.kunci, {
      kunci: r.kunci,
      nama: namaRekening(r.contoh),
      bank: r.contoh.bank,
      nomorAkhir: r.contoh.nomorAkhir,
      saku: r.contoh.saku,
      utama: r.contoh.utama,
      kantong: id,
      namaKantong: id ? (cariKantong(id)?.name ?? kantongBaru.find((k) => k.kunci === id)?.name ?? null) : null,
      dari: urut[0].dari,
      sampai: urut.reduce((s, x) => (x.sampai > s ? x.sampai : s), urut[0].sampai),
      berkas: r.semua.length,
      baris: 0,
      baru: 0,
      tercatat: 0,
      pindah: 0,
      barisBunga: 0,
      bunga: 0,
      perluDilengkapi: 0,
      dariIngatan: 0,
      cicilan: 0,
      saldoBank: urut.reduce((x, y) => (y.sampai >= x.sampai ? y : x)).saldoAkhir,
      saldoAplikasi: null,
      samakan: null,
      diubahPindah: [],
      saldoDariRekening: false,
      deposito: [],
    });
  }
  for (const b of kerja) ringkas.get(b.kunciRek)!.baris++;
  // Urutan baris rekening koran (SPEC-lengkapi §1): tanggal, lalu urutan di berkas.
  const posisi = new Map([...kerja].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.urut - b.urut).map((b, i) => [b, i]));
  const urutDari = (b: BarisKerja | null | undefined) => (b ? posisi.get(b) : undefined);

  const kategoriAda = (type: string, slug: string) => !m.kategori || m.kategori.some((k) => k.type === type && k.slug === slug);
  const kat = (type: "income" | "expense", slug: string) => (kategoriAda(type, slug) ? slug : "other");

  const sisip: TxBaru[] = [];
  const tautkan: Rencana["tautkan"] = [];
  const perbarui: Rencana["perbarui"] = [];
  const ragu: Ragu[] = [];
  const hitung = { pasangan: 0, antarJago: 0, ikutan: 0 };
  let urutKunci = 0;
  const kunciBaru = () => `t${urutKunci++}`;
  const namaKantong = (id: RujukanKantong | null) => (id ? (cariKantong(id)?.name ?? kantongBaru.find((k) => k.kunci === id)?.name ?? null) : null);

  // Sudah diimpor sebelumnya (ref tersimpan).
  for (const b of kerja)
    if (m.sudahAda.has(b.ref)) {
      b.selesai = true;
      ringkas.get(b.kunciRek)!.tercatat++;
    }
  // Rekening yang belum dipetakan tidak diproses.
  for (const b of kerja) if (!b.kantong) b.selesai = true;
  // Tidak dicentang di rincian (SPEC-periksa-dulu §3): dilewati, tanpa dihitung tercatat.
  const kecuali = new Set(pilihan.kecuali ?? []);
  for (const b of kerja) if (kecuali.has(b.ref)) b.selesai = true;
  const dariIngatan: string[] = [];

  // Transaksi lama: sisi mana yang masih bebas ditautkan.
  const lama = m.transaksi.map((t) => ({ ...t, n: Number(t.amount), bebasAsal: !t.ref_bank, bebasTujuan: !t.ref_bank_tujuan }));
  const pakaiAsal = (t: (typeof lama)[number], ref: string) => {
    t.bebasAsal = false;
    const ada = tautkan.find((x) => x.id === t.id);
    if (ada) ada.ref_bank = ref;
    else tautkan.push({ id: t.id, ref_bank: ref });
  };
  const pakaiTujuan = (t: (typeof lama)[number], ref: string) => {
    t.bebasTujuan = false;
    const ada = tautkan.find((x) => x.id === t.id);
    if (ada) ada.ref_bank_tujuan = ref;
    else tautkan.push({ id: t.id, ref_bank_tujuan: ref });
  };
  const tandaiTercatat = (b: BarisKerja) => {
    b.selesai = true;
    ringkas.get(b.kunciRek)!.tercatat++;
  };

  // 3. Biaya transfer yang menempel (BRI BI-Fast: waktu & uraian sama, nominal kecil;
  //    SeaBank: baris "Fee" sesudah top up/transfer di hari yang sama).
  const indukBiaya = new Map<BarisKerja, BarisKerja>();
  for (const r of daftarRek) {
    const baris = kerja.filter((b) => b.kunciRek === r.kunci).sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.urut - b.urut);
    for (let i = 1; i < baris.length; i++) {
      const b = baris[i];
      const sebelum = baris[i - 1];
      if (b.nominal >= 0 || sebelum.nominal >= 0 || sebelum.gol !== "transfer") continue;
      const briBiaya = r.contoh.bank === "bri" && b.jam && b.jam === sebelum.jam && b.tanggal === sebelum.tanggal && b.uraian === sebelum.uraian && -b.nominal <= 10_000 && -b.nominal < -sebelum.nominal;
      const seaBiaya = r.contoh.bank === "seabank" && b.gol === "biaya" && b.tanggal === sebelum.tanggal;
      const jagoBiaya = r.contoh.bank === "jago" && b.gol === "biaya" && /^Biaya Transfer/i.test(b.jenis ?? "") && b.tanggal === sebelum.tanggal && b.jam === sebelum.jam;
      if (briBiaya || seaBiaya || jagoBiaya) {
        b.gol = "biaya";
        indukBiaya.set(b, sebelum);
      }
    }
  }

  // 3b. Deposito jatuh tempo (SPEC-deposito-jatuh-tempo): satu kejadian = satu catatan.
  const { milikDeposito, depositoKe, pencairanTutup, tutup, sesuaikan, jadikan, tawaranJadikan, daftarDeposito } = jatuhTempo();

  function jatuhTempo() {
    const JENDELA = 3; // K4: ± 3 hari (libur bank / akhir pekan)
    const dekat = (b: BarisKerja, tgl: string) => Math.abs(selisihHari(b.tanggal, tgl)) <= JENDELA;
    const jumlah = (d: BarisKerja[]) => sen(d.reduce((n, b) => n + b.nominal, 0));
    const milikDeposito = new Set<BarisKerja>();
    /** Pencairan yang dicatat bagian 5/7 sebagai pindah kantong: SeaBank diarahkan ke depositonya. */
    const depositoKe = new Map<BarisKerja, RujukanKantong>();
    /** Pencairan periode yang ditutup di sini: pindah kantongnya ikut transaksi_tutup. */
    const pencairanTutup: { b: BarisKerja; t: TutupRekening }[] = [];
    const tutup: TutupRekening[] = [];
    const sesuaikan: SesuaikanPeriode[] = [];
    const jadikan: JadikanDeposito[] = [];
    const tawaranJadikan: TawaranJadikan[] = [];
    type DepositoKerja = Omit<DepositoRencana, "kantong_id" | "induk_id"> & { kantong_id: RujukanKantong; induk_id: RujukanKantong | null };
    const daftarDeposito: DepositoKerja[] = (m.deposito ?? []).map((d) => ({ ...d, periode: [...d.periode].sort((a, b) => a.ke - b.ke).map((p) => ({ ...p })) }));

    // K2: kantong Jago bernama "Deposito" yang belum jadi deposito → "Jadikan deposito?".
    for (const r of daftarRek) {
      const c = r.contoh;
      const id = petaRek.get(r.kunci);
      if (c.bank !== "jago" || c.utama || !/deposito/i.test(c.saku ?? "") || !id || daftarDeposito.some((d) => d.kantong_id === id)) continue;
      const tempat = kerja
        .filter((b) => b.kunciRek === r.kunci && b.nominal > 0 && /^Penempatan Dana/i.test(b.jenis ?? ""))
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.urut - b.urut)[0];
      const awal = [...r.semua].sort((a, b) => a.dari.localeCompare(b.dari))[0];
      const isian = pilihan.jadikan?.[r.kunci] ?? null;
      const mulai = tempat?.tanggal ?? (isian?.mulai || null);
      // Tanpa baris penempatan: pokoknya saldo kantong di awal rekening koran (penempatan sebelum periode ini).
      const pokok = tempat ? tempat.nominal : mulai && mulai <= awal.dari && awal.saldoAwal > 0 ? awal.saldoAwal : null;
      const galat = isian ? cekJadikan(isian, mulai, pokok) : null;
      tawaranJadikan.push({ kunci: r.kunci, kantong: id, name: c.saku!, mulai: tempat?.tanggal ?? null, pokok: tempat?.nominal ?? null, teks: "Jadikan deposito?", isian, galat });
      if (!isian || galat) continue;
      const aturan = { bunga_persen: isian.bunga_persen, tenor: isian.tenor, satuan_tenor: isian.satuan_tenor, pajak_persen: pajakBawaan(pokok!), pajak_otomatis: true, perpanjangan: isian.perpanjangan };
      const p1 = periodeDeposito(aturan, mulai!, pokok!);
      const kunci = `periode:${r.kunci}:1`;
      jadikan.push({ kantong_id: id, ...aturan, periode: { kunci, mulai: p1.mulai, jatuh_tempo: p1.jatuh_tempo, pokok: p1.pokok, bunga_kotor: p1.bunga_kotor, pajak: p1.pajak, bunga_bersih: p1.bunga_bersih } });
      daftarDeposito.push({ kantong_id: id, name: namaKantong(id) ?? c.saku!, induk_id: indukJago, ...aturan, selesai: false, periode: [{ id: kunci, ke: 1, ...p1, bunga_diterima: null, dicairkan_awal: false, transaksi_tutup: null }] });
    }

    for (const d of daftarDeposito) {
      // Jago: kantong deposito itu sendiri. SeaBank (longgar, perlu dicek ulang): rekening induknya.
      const rek =
        daftarRek.find((x) => x.contoh.bank === "jago" && !x.contoh.utama && petaRek.get(x.kunci) === d.kantong_id) ??
        (d.induk_id ? daftarRek.find((x) => x.contoh.bank === "seabank" && petaRek.get(x.kunci) === d.induk_id) : undefined);
      if (!rek) continue;
      const jago = rek.contoh.bank === "jago";
      const rr = ringkas.get(rek.kunci)!;
      const induk = jago ? indukJago : d.induk_id;
      const patokan = patokanDeposito(d.periode);
      for (let i = 0; i < d.periode.length; i++) {
        const p = d.periode[i];
        if (p.dicairkan_awal) break;
        const terbuka = p.bunga_diterima == null;
        // Hanya periode terakhir yang bisa ditutup.
        if (terbuka && i !== d.periode.length - 1) break;
        const baris = kerja.filter((b) => b.kunciRek === rek.kunci && !milikDeposito.has(b) && dekat(b, p.jatuh_tempo));
        const pokok = Number(p.pokok);
        let bunga: BarisKerja[];
        let pajak: BarisKerja[];
        let cair: BarisKerja | null;
        if (jago) {
          bunga = baris.filter((b) => b.gol === "bunga" && b.nominal > 0);
          pajak = baris.filter((b) => b.gol === "pajak" && b.nominal < 0);
          // Belum ada contoh pencairan Jago: "Pencairan Dana …" keluar dari kantong deposito.
          cair = baris.find((b) => b.gol === "antarJago" && b.nominal < 0 && /^Pencairan Dana/i.test(b.jenis ?? "")) ?? null;
        } else {
          // Bunga tabungan ("Savings Interest") bukan milik deposito.
          const bukanTabungan = (b: BarisKerja) => !/savings/i.test(`${b.uraian} ${b.pihak?.nama ?? ""}`);
          bunga = baris.filter((b) => b.gol === "bunga" && b.nominal > 0 && bukanTabungan(b));
          pajak = baris.filter((b) => b.gol === "pajak" && b.nominal < 0 && bukanTabungan(b));
          const kira = pokok + (bunga.length ? 0 : Number(p.bunga_bersih));
          cair =
            baris
              .filter((b) => b.gol === "deposito" && b.nominal > 0 && b.nominal >= pokok - 0.005)
              .sort((a, b) => Math.abs(a.nominal - kira) - Math.abs(b.nominal - kira))[0] ?? null;
        }
        // Bunga terpisah, atau (SeaBank) digabung ke pencairan: bersih = masuk − pokok.
        const gabung = !bunga.length && !jago && cair !== null;
        if (!bunga.length && !gabung) break;
        if (!cair && d.perpanjangan === "sekali") break;
        const kotor = gabung ? sen(cair!.nominal - pokok) : jumlah(bunga);
        const potong = gabung ? 0 : -jumlah(pajak);
        const bersih = sen(kotor - potong);
        if (bersih < 0) break;
        const ref = gabung ? `${cair!.ref}:bunga` : bunga[0].ref;
        const contoh = gabung ? cair! : bunga[0];
        // Bunga masuk ke tempat barisnya: kantong deposito (Jago, atau digabung ke pencairan), atau induk (SeaBank terpisah).
        const ke: RujukanKantong = jago || gabung ? d.kantong_id : induk!;
        const keterangan = `Bunga deposito ke-${p.ke}${gabung ? "" : ` · kotor ${fmtIDR(kotor)}, pajak ${fmtIDR(potong)}`} · dari rekening koran`;
        const semua = [...bunga, ...pajak];
        // "Deposito Uji jatuh tempo …"; nama yang sudah menyebut deposito tidak diulang.
        const judul = `${/deposito/i.test(d.name) ? d.name : `Deposito ${d.name}`} jatuh tempo ${tglPanjang(p.jatuh_tempo)}`;
        const transaksiBunga = (): TxBaru => {
          rr.baru++;
          const t: TxBaru = {
            kunci: kunciBaru(),
            type: "income",
            amount: bersih,
            category: kat("income", "investment"),
            merchant: d.name,
            description: keterangan,
            transaction_date: contoh.tanggal,
            waktu: contoh.jam,
            kantong_id: ke,
            kantong_tujuan_id: null,
            induk: null,
            ref_bank: ref,
            ref_bank_tujuan: null,
            perlu_dilengkapi: false,
            urut: urutDari(contoh),
          };
          sisip.push(t);
          return t;
        };
        /** Perpanjangan dengan bunga: pokok periode berikutnya bertambah bunga yang masuk ke deposito. */
        const pokokBerikut = (bungaMasuk: number) => sen(pokok + (d.perpanjangan === "pokok_bunga" && ke === d.kantong_id ? bungaMasuk : 0));

        if (terbuka) {
          // Baris yang sudah tersimpan di transaksi lain: biarkan seperti sebelumnya.
          if ([...semua, cair].some((b) => b && m.sudahAda.has(b.ref))) break;
          // Bulan yang bunganya sudah terimpor digabung ("Bunga <bulan>"): dipakai sebagai
          // bunga deposito bila isinya hanya baris deposito ini; selain itu jangan ditutup.
          let bulanan: (typeof lama)[number] | null = null;
          let gagalBulan = false;
          for (const ym of new Set(semua.map((b) => b.tanggal.slice(0, 7)))) {
            const ada = lama.find((t) => t.ref_bank === `${rek.kunci}:bunga:${ym}`);
            if (!ada) continue;
            const isiBulan = kerja.filter((b) => b.kunciRek === rek.kunci && (b.gol === "bunga" || b.gol === "pajak") && b.tanggal.startsWith(ym));
            if (bulanan || !isiBulan.every((b) => semua.includes(b))) gagalBulan = true;
            bulanan = ada;
          }
          if (gagalBulan) break;
          const t: TutupRekening = { periode: p.id, deposito: d.kantong_id, bunga: bersih, cair: Boolean(cair), transaksi: [], baru: null };
          if (bulanan) {
            pakaiAsal(bulanan, ref);
            perbarui.push({ id: bulanan.id, amount: bersih, description: keterangan });
            t.transaksi.push(bulanan.id);
          } else if (bersih > 0) t.transaksi.push(transaksiBunga().kunci);
          for (const b of semua) b.selesai = true;
          if (cair) {
            depositoKe.set(cair, d.kantong_id);
            pencairanTutup.push({ b: cair, t });
          } else {
            const np = periodeDeposito(d, p.jatuh_tempo, pokokBerikut(bersih), patokan);
            const kunci = `periode:${d.kantong_id}:${p.ke + 1}`;
            t.baru = { kunci, mulai: np.mulai, jatuh_tempo: np.jatuh_tempo, pokok: np.pokok, bunga_kotor: np.bunga_kotor, pajak: np.pajak, bunga_bersih: np.bunga_bersih };
            d.periode.push({ id: kunci, ke: p.ke + 1, ...np, bunga_diterima: null, dicairkan_awal: false, transaksi_tutup: null });
          }
          p.bunga_diterima = bersih;
          tutup.push(t);
          const lanjut = cair ? `${fmtIDR(cair.nominal)} kembali ke ${namaKantong(induk) ?? "induknya"}` : `diperpanjang sampai ${tglPanjang(t.baru!.jatuh_tempo)}`;
          rr.deposito.push({
            teks: `${judul}: bunga bersih ${fmtIDR(bersih)} (perkiraan ${fmtIDR(Number(p.bunga_bersih))}) · ${lanjut}`,
            peringatan: Math.round(bersih) !== Math.round(Number(p.bunga_bersih)),
            judul: "Bunga deposito beda dengan perkiraan",
          });
        } else {
          // Sudah dievaluasi di aplikasi: baris bank ditautkan ke hasil evaluasinya.
          const hasil = lama.filter((t) => p.transaksi_tutup?.includes(t.id));
          const masuk = hasil.find((t) => t.type === "income") ?? null;
          const pindah = hasil.find((t) => t.type === "transfer") ?? null;
          const diterima = Number(p.bunga_diterima);
          /** Hasil evaluasi yang tanggal/jamnya beda dengan baris bank: ikut bank, supaya saldo akhir periodenya sama. */
          const tanggal: NonNullable<SesuaikanPeriode["tanggal"]> = [];
          const ikutBank = (t: (typeof lama)[number], b: BarisKerja) => {
            if (t.transaction_date === b.tanggal && (t.waktu ?? null)?.slice(0, 5) === (b.jam ?? null)?.slice(0, 5)) return;
            tanggal.push({ id: t.id, transaction_date: b.tanggal, waktu: b.jam });
            t.transaction_date = b.tanggal;
            t.waktu = b.jam;
          };
          for (const b of semua) if (!b.selesai) tandaiTercatat(b);
          // Pencairan yang sudah dicatat evaluasi (deposito selesai): ditautkan, bukan pindah kantong kedua.
          if (cair && pindah && d.selesai && !cair.selesai) {
            if (jago) {
              const lawan = kerja.find((b) => !b.selesai && b.gol === "antarJago" && b.kunciRek !== rek.kunci && b.nominal === -cair.nominal && b.tanggal === cair.tanggal && b.jam === cair.jam);
              if (pindah.bebasAsal) pakaiAsal(pindah, cair.ref);
              if (lawan && pindah.bebasTujuan) {
                pakaiTujuan(pindah, lawan.ref);
                tandaiTercatat(lawan);
              }
            } else if (pindah.bebasTujuan) pakaiTujuan(pindah, cair.ref);
            tandaiTercatat(cair);
            ikutBank(pindah, cair);
          } else if (cair) depositoKe.set(cair, d.kantong_id);
          if (!(masuk && masuk.ref_bank === ref)) {
            if (masuk?.bebasAsal && !m.sudahAda.has(ref)) pakaiAsal(masuk, ref);
            if (masuk) ikutBank(masuk, contoh);
            const beda = Math.abs(diterima - bersih) >= 0.005;
            let tambah: string | null = null;
            if (!masuk && bersih > 0) tambah = transaksiBunga().kunci;
            if (beda || tambah || tanggal.length) {
              // K1: ikut angka (dan tanggal) bank.
              const berikut = d.periode[i + 1];
              let ubahBerikut: SesuaikanPeriode["berikut"] = null;
              if (beda && berikut && berikut.bunga_diterima == null && !berikut.dicairkan_awal && d.perpanjangan === "pokok_bunga") {
                const np = periodeDeposito(d, berikut.mulai, pokokBerikut(bersih), patokan);
                ubahBerikut = { id: berikut.id, pokok: np.pokok, bunga_kotor: np.bunga_kotor, pajak: np.pajak, bunga_bersih: np.bunga_bersih };
                Object.assign(berikut, ubahBerikut);
              }
              sesuaikan.push({
                periode: p.id,
                bunga: bersih,
                transaksi: masuk && beda ? { id: masuk.id, amount: bersih, description: `${masuk.description || keterangan.replace(/ · dari rekening koran$/, "")} · disesuaikan dengan rekening koran`.slice(0, 300) } : null,
                tambah,
                berikut: ubahBerikut,
                tanggal,
              });
              if (masuk && beda) {
                masuk.amount = bersih;
                masuk.n = bersih;
              }
              p.bunga_diterima = bersih;
            }
            rr.deposito.push(
              beda
                ? { teks: `${judul}: sudah dicek di aplikasi; bunga diubah dari ${fmtIDR(diterima)} jadi ${fmtIDR(bersih)} sesuai bank`, peringatan: true, judul: "Bunga deposito diubah sesuai bank" }
                : { teks: `${judul}: sudah dicek di aplikasi, ditautkan ke rekening koran${tanggal.length ? `; tanggalnya ikut bank (${tglPanjang(contoh.tanggal)})` : ""}`, peringatan: false },
            );
          } else if (tanggal.length) sesuaikan.push({ periode: p.id, bunga: diterima, transaksi: null, tambah: null, berikut: null, tanggal });
        }
        for (const b of semua) milikDeposito.add(b);
        if (cair) {
          milikDeposito.add(cair);
          break;
        }
      }
    }
    return { milikDeposito, depositoKe, pencairanTutup, tutup, sesuaikan, jadikan, tawaranJadikan, daftarDeposito };
  }

  // 4. Bunga & pajak: digabung satu pemasukan bersih per bulan per rekening (K2).
  const bungaPerBulan = new Map<string, BarisKerja[]>();
  for (const b of kerja) {
    if (b.gol !== "bunga" && b.gol !== "pajak") continue;
    // Milik deposito yang jatuh tempo (SPEC-deposito-jatuh-tempo §2): tidak ikut digabung.
    if (milikDeposito.has(b)) continue;
    ringkas.get(b.kunciRek)!.barisBunga++;
    const k = `${b.kunciRek}|${b.tanggal.slice(0, 7)}`;
    bungaPerBulan.set(k, [...(bungaPerBulan.get(k) ?? []), b]);
  }
  let barisBunga = 0;
  for (const [k, daftar] of bungaPerBulan) {
    const [kunciRek, ym] = k.split("|");
    barisBunga += daftar.length;
    const terakhir = [...daftar].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.urut - b.urut).at(-1)!;
    const kantongId = terakhir.kantong;
    const bisa = daftar.filter((b) => !b.selesai || m.sudahAda.has(b.ref));
    daftar.forEach((b) => (b.selesai = true));
    if (!kantongId || !bisa.length) continue;
    const kotor = sen(daftar.filter((b) => b.gol === "bunga").reduce((n, b) => n + b.nominal, 0));
    const pajak = sen(-daftar.filter((b) => b.gol === "pajak").reduce((n, b) => n + b.nominal, 0));
    const bersih = sen(kotor - pajak);
    const hari = daftar.filter((b) => b.gol === "bunga").length;
    const rek = rekMap.get(kunciRek)!.contoh;
    const description = `Bunga ${labelBulan(ym)}${hari > 1 ? ` (${hari} hari)` : ""}${pajak > 0 ? ` · kotor ${fmtIDR(kotor)}, pajak ${fmtIDR(pajak)}` : ""}`;
    const ref = `${kunciRek}:bunga:${ym}`;
    const ada = lama.find((t) => t.ref_bank === ref);
    const rr = ringkas.get(kunciRek)!;
    if (ada) {
      // Bulan yang sama dari rekening koran yang lebih lengkap: nominalnya bertambah.
      if (bersih > ada.n) perbarui.push({ id: ada.id, amount: bersih, description });
      rr.tercatat += daftar.length;
      continue;
    }
    if (bersih <= 0 || kecuali.has(ref)) continue;
    rr.bunga++;
    sisip.push({
      kunci: kunciBaru(),
      type: "income",
      amount: bersih,
      category: kat("income", "investment"),
      merchant: rek.bank === "jago" && rek.saku && !rek.utama ? `Jago · ${rek.saku}` : NAMA_BANK[rek.bank],
      description,
      transaction_date: terakhir.tanggal,
      waktu: terakhir.jam,
      kantong_id: kantongId,
      kantong_tujuan_id: null,
      induk: null,
      ref_bank: ref,
      ref_bank_tujuan: null,
      perlu_dilengkapi: false,
      urut: urutDari(terakhir),
    });
  }

  // 5. Pindah antar kantong Jago (K1): kedua sisi di laporan bulanan, atau satu sisi (riwayat).
  const namaSaku = new Map(daftarRek.map((r) => [r.kunci, r.contoh.saku ?? ""]));
  const tambahTransfer = (asal: BarisKerja | null, tujuan: BarisKerja | null, dari: RujukanKantong, ke: RujukanKantong, contoh: BarisKerja, uraian: string) => {
    const t: TxBaru = {
      kunci: kunciBaru(),
      type: "transfer",
      amount: Math.abs(contoh.nominal),
      category: null,
      merchant: uraian,
      description: [contoh.uraian, contoh.catatan].filter(Boolean).join(" · ").slice(0, 300) || null,
      transaction_date: (asal ?? tujuan ?? contoh).tanggal,
      waktu: (asal ?? tujuan ?? contoh).jam ?? (tujuan ?? contoh).jam,
      kantong_id: dari,
      kantong_tujuan_id: ke,
      induk: null,
      ref_bank: asal?.ref ?? null,
      ref_bank_tujuan: tujuan?.ref ?? null,
      perlu_dilengkapi: false,
      urut: urutDari(asal ?? tujuan ?? contoh),
    };
    sisip.push(t);
    for (const b of [asal, tujuan]) {
      if (!b) continue;
      b.selesai = true;
      ringkas.get(b.kunciRek)!.pindah++;
    }
    return t;
  };
  const cariLamaTransfer = (dari: RujukanKantong, ke: RujukanKantong, n: number, tanggal: string, perluAsal: boolean, perluTujuan: boolean) =>
    lama.find(
      (t) =>
        t.type === "transfer" &&
        t.kantong_id === dari &&
        t.kantong_tujuan_id === ke &&
        Math.abs(t.n - n) < 0.005 &&
        Math.abs(selisihHari(t.transaction_date, tanggal)) <= 1 &&
        (!perluAsal || t.bebasAsal) &&
        (!perluTujuan || t.bebasTujuan),
    );
  /** Pasangan dua sisi (atau satu sisi) → transfer lama yang cocok, atau transfer baru. */
  const catatPindah = (asal: BarisKerja | null, tujuan: BarisKerja | null, dari: RujukanKantong, ke: RujukanKantong, uraian: string) => {
    const contoh = (asal ?? tujuan)!;
    const ada = cariLamaTransfer(dari, ke, Math.abs(contoh.nominal), contoh.tanggal, Boolean(asal), Boolean(tujuan));
    if (ada) {
      if (asal) pakaiAsal(ada, asal.ref);
      if (tujuan) pakaiTujuan(ada, tujuan.ref);
      for (const b of [asal, tujuan]) if (b) tandaiTercatat(b);
      return null;
    }
    return tambahTransfer(asal, tujuan, dari, ke, contoh, uraian);
  };

  const antarJago = kerja.filter((b) => !b.selesai && b.gol === "antarJago");
  for (const a of antarJago) {
    if (a.selesai || a.nominal >= 0) continue;
    // Sisi lain: kantong Jago bernama pihak lawannya, nominal berlawanan, tanggal & jam sama.
    const b = antarJago.find(
      (x) => !x.selesai && x !== a && x.nominal === -a.nominal && x.tanggal === a.tanggal && x.jam === a.jam && sama(namaSaku.get(x.kunciRek), a.pihak?.nama) && sama(x.pihak?.nama, namaSaku.get(a.kunciRek)),
    );
    if (b) {
      hitung.antarJago++;
      catatPindah(a, b, a.kantong!, b.kantong!, "Pindah antar kantong Jago");
    }
  }
  // Satu sisi saja (riwayat Kantong Utama, atau kantong lawan tidak ada di berkas ini).
  for (const a of antarJago) {
    if (a.selesai) continue;
    // Kantong yang sudah ditutup tampil tanpa nama ("Tarik Uang Kantong"): tidak dibuatkan simpanan.
    const lawan = /^((Tambah|Tarik) Uang Kantong|Pindah uang antar Kantong)$/i.test(a.pihak?.nama ?? "") ? "" : (a.pihak?.nama ?? "");
    const rekLawan = daftarRek.find((r) => r.contoh.bank === "jago" && sama(r.contoh.saku, lawan));
    let idLawan: RujukanKantong | null = rekLawan ? (petaRek.get(rekLawan.kunci) ?? null) : null;
    if (!idLawan && /^Kantong Utama$/i.test(lawan)) idLawan = indukJago;
    if (!idLawan && lawan) {
      idLawan = simpananJago(lawan, null);
      if (!idLawan && indukJago) {
        // Kantong Jago yang tidak ada di berkas ini: simpanan baru bersaldo 0 sejak sekarang.
        idLawan = `baru:jago-saku:${normal(lawan)}`;
        kantongBaru.push({ kunci: idLawan, name: namaUnik(lawan, `${lawan} (Jago)`), emoji: "🐷", kind: "simpanan", induk_id: indukJago, macam_simpanan: "tabungan", saldo_awal: 0, saldo_sejak: null, nomor_akhir: "" });
      }
    }
    if (!idLawan || idLawan === a.kantong) {
      a.gol = "lain";
      continue;
    }
    hitung.antarJago++;
    if (a.nominal < 0) catatPindah(a, null, a.kantong!, idLawan, "Pindah antar kantong Jago");
    else catatPindah(null, a, idLawan, a.kantong!, "Pindah antar kantong Jago");
  }

  // 6. Pindah kantong antar rekening sendiri (§6).
  const kantongUang = kantong.filter((k) => KANTONG_UANG.has(k.kind));
  const semuaUang = [...kantongUang.map((k) => ({ id: k.id, name: k.name, aliases: k.aliases ?? null, nomor_akhir: k.nomor_akhir ?? null })), ...kantongBaru.filter((k) => k.kind === "bank").map((k) => ({ id: k.kunci, name: k.name, aliases: null, nomor_akhir: k.nomor_akhir }))];
  const nomorKantong = (id: RujukanKantong | null) => (id ? (nomorAkhir.get(id) ?? semuaUang.find((k) => k.id === id)?.nomor_akhir ?? null) : null);
  const namaUser = m.namaUser ?? [];
  /** Nama ini nama user: pemilik rekening koran (boleh tersamar), atau nama_rekening user (B-1). */
  const namaMilik = (nama: string | null | undefined, pemilik: string | null) =>
    Boolean(nama) && (samaPemilik(nama, pemilik) || namaUser.some((n) => samaPemilik(nama, n) || namaSama(n, nama!)));
  /** Tanda rekening sendiri dari nama (§6): nama pihak, atau nama tersamar di uraian "Top Up …" BRI. */
  const milikSendiri = (b: BarisKerja) =>
    namaMilik(b.pihak?.nama, b.pemilik) || (b.rek.bank === "bri" && /^Top Up/i.test(b.uraian) && namaMilik(b.uraian.replace(/^Top Up \S+ \S+ /i, "").replace(/ via BRImo$/i, ""), b.pemilik));
  /** Kantong sendiri yang dituju baris ini: dari 4 digit akhir nomor lawan, atau nama bank/e-wallet bila nama pihaknya pemilik. */
  const jenisKantong = (id: RujukanKantong) => cariKantong(id)?.kind ?? kantongBaru.find((k) => k.kunci === id)?.kind ?? null;
  const kantongLawan = (b: BarisKerja): RujukanKantong | null => {
    const akhir = empatAkhir(b.pihak?.nomor);
    const bank = b.pihak?.bank;
    const lain = semuaUang.filter((x) => x.id !== b.kantong);
    const menurutNama = bank ? cocokkanKantong(bank, lain) : null;
    const menurutNomor = akhir ? lain.find((x) => nomorKantong(x.id) === akhir) : undefined;
    // Nomor cocok dan nama banknya tidak menyebut kantong lain (nomor HP e-wallet
    // bisa kebetulan berakhiran sama dengan nomor rekening).
    if (menurutNomor && (!menurutNama || menurutNama.id === menurutNomor.id)) return menurutNomor.id;
    // U3: top up (bukan pembayaran) ke e-wallet yang kantongnya sudah ada = pindah kantong, walau
    // tanpa tanda milik sendiri. Kantong e-wallet baru (A-2) tetap butuh tandanya (di bawah).
    if (b.nominal < 0 && TOP_UP.test(`${b.pihak?.nama ?? ""} ${b.uraian} ${b.jenis ?? ""}`)) {
      const ew = namaEwallet(bank) ?? namaEwallet(b.pihak?.nama) ?? namaEwallet(b.uraian);
      const tuju = ew ? cocokkanKantong(ew, lain.filter((x) => jenisKantong(x.id) === "ewallet")) : null;
      if (tuju) return tuju.id;
    }
    if (!milikSendiri(b) || !menurutNama) return null;
    // Kantong yang namanya cocok tapi nomornya lain: rekening lain di bank yang sama.
    const nomor = nomorKantong(menurutNama.id);
    return !akhir || !nomor || nomor === akhir ? menurutNama.id : null;
  };
  /** Penyedia paylater yang disebut baris ini, dibakukan (D-1). */
  const penyediaBaris = (b: BarisKerja) => penyediaPaylater(`${b.uraian} ${b.pihak?.nama ?? ""}`);
  // Kantong orang/kartu/utang paylater untuk SPinjam / SPayLater: nama dibakukan (D-1),
  // atau kantong utang paylater yang dibuat di impor ini (D-4).
  const kantongPaylater = (b: BarisKerja): RujukanKantong | null => {
    const pl = penyediaBaris(b);
    if (!pl) return null;
    const baku = normal(pl);
    const ada = kantong.find((k) => (k.kind === "orang" || k.kind === "kredit") && (normal(bakukanPaylater(k.name)) === baku || normal(k.name).includes(baku)));
    return ada?.id ?? kantongBaru.find((k) => k.kind === "kredit" && normal(k.name) === baku)?.kunci ?? null;
  };
  /** Sudah dicatat sendiri sebagai pengeluaran (nominal & kantong sama, ±1 hari): dibiarkan untuk bagian 8 (ditautkan). */
  const sudahDicatat = (a: BarisKerja) =>
    a.nominal < 0 && lama.some((t) => t.type === "expense" && t.kantong_id === a.kantong && t.bebasAsal && Math.abs(t.n + a.nominal) < 0.005 && Math.abs(selisihHari(t.transaction_date, a.tanggal)) <= 1);
  const bisaPindah = (b: BarisKerja) => !b.selesai && Boolean(b.kantong) && (b.gol === "transfer" || b.gol === "bayar" || b.gol === "lain") && !(b.rek.bank === "jago" && !b.rek.utama);

  // 6a. Bayar tagihan paylater → cicilan rencana penyedia itu yang jatuh tempo ± 7 hari
  //     dengan nominal sama (SPEC-kantong-sendiri D-3), bukan pengeluaran/pindah biasa.
  const cicilanTerpakai = new Map<string, Set<number>>();
  const cicilanCocok = (a: BarisKerja) => {
    const pl = penyediaBaris(a);
    if (!pl || a.nominal >= 0) return null;
    let pilih: { r: CicilanRencana; ke: number; jarak: number } | null = null;
    for (const r of m.cicilan ?? []) {
      if (![r.penyedia, r.nama].some((n) => n && normal(bakukanPaylater(n)) === normal(pl))) continue;
      if (Math.abs(Number(r.nominal) + a.nominal) >= 0.005) continue;
      const pakai = cicilanTerpakai.get(r.id);
      for (let ke = 1; ke <= r.tenor; ke++) {
        if (r.dibayar.includes(ke) || pakai?.has(ke)) continue;
        const jarak = Math.abs(selisihHari(jatuhTempoKe(r.jatuh_tempo_awal, ke), a.tanggal));
        if (jarak <= 7 && (!pilih || jarak < pilih.jarak)) pilih = { r, ke, jarak };
      }
    }
    return pilih;
  };
  for (const a of [...kerja].sort((x, y) => x.tanggal.localeCompare(y.tanggal) || x.urut - y.urut)) {
    if (!bisaPindah(a) || sudahDicatat(a)) continue;
    const c = cicilanCocok(a);
    if (!c) continue;
    cicilanTerpakai.set(c.r.id, new Set([...(cicilanTerpakai.get(c.r.id) ?? []), c.ke]));
    const rr = ringkas.get(a.kunciRek)!;
    rr.baru++;
    rr.cicilan++;
    const t: TxBaru = {
      kunci: kunciBaru(),
      type: "expense",
      amount: -a.nominal,
      category: kat("expense", c.r.category),
      merchant: c.r.nama.slice(0, 100),
      description: `${keteranganCicilan(c.r, c.ke)} · ${a.uraian}`.slice(0, 300),
      transaction_date: a.tanggal,
      waktu: a.jam,
      kantong_id: a.kantong!,
      kantong_tujuan_id: null,
      induk: null,
      ref_bank: a.ref,
      ref_bank_tujuan: null,
      perlu_dilengkapi: false,
      cicilan_id: c.r.id,
      cicilan_ke: c.ke,
      urut: urutDari(a),
    };
    sisip.push(t);
    a.selesai = true;
    for (const [biaya, induk] of indukBiaya) if (induk === a) tempelBiaya(biaya, t);
  }

  // 6b. E-wallet/bank milik sendiri (nama pemilik/tersamar, §6) atau paylater yang belum
  //     punya kantong → tawaran kantong baru, tercentang (A-2, D-3/D-4). Diterima: barisnya
  //     jadi pindah kantong ke kantong itu (bagian di bawah); tidak: pengeluaran seperti biasa.
  const tawaranKantong: TawaranKantong[] = [];
  {
    const kumpul = new Map<string, { name: string; kind: TawaranKantong["kind"]; baris: BarisKerja[] }>();
    for (const a of kerja) {
      if (!bisaPindah(a) || kantongLawan(a) || kantongPaylater(a) || sudahDicatat(a)) continue;
      const pl = penyediaBaris(a);
      let name: string;
      let kind: TawaranKantong["kind"];
      if (pl) {
        name = pl;
        kind = "kredit";
      } else {
        const lembaga = namaLembaga(a.pihak?.bank);
        if (!lembaga || !milikSendiri(a)) continue;
        // Bank/e-wallet itu sudah punya kantong (nomornya lain): bukan kantong baru.
        if (cocokkanKantong(lembaga, semuaUang) || kantongBank(a.pihak?.bank ?? null, semuaUang)) continue;
        name = lembaga;
        kind = tebakJenisKantong(lembaga) === "ewallet" ? "ewallet" : "bank";
      }
      const kunci = `baru:lawan:${normal(name)}`;
      const g = kumpul.get(kunci) ?? { name, kind, baris: [] };
      g.baris.push(a);
      kumpul.set(kunci, g);
    }
    for (const [kunci, g] of kumpul) {
      const dari = [...new Set(g.baris.map((b) => NAMA_BANK[b.rek.bank]))].join(" & ");
      const keluar = g.baris.filter((b) => b.nominal < 0).length;
      const masuk = g.baris.length - keluar;
      const kata = g.kind === "ewallet" ? "top up" : g.kind === "kredit" ? "bayar tagihan" : "transfer";
      const bagian = [keluar ? `${keluar} ${kata} dari ${dari}` : null, masuk ? `${masuk} ${g.kind === "kredit" ? "pencairan" : "uang masuk"} ke ${dari}` : null].filter(Boolean);
      const dipilih = !pilihan.tolakKantong?.includes(kunci);
      tawaranKantong.push({ kunci, name: g.name, kind: g.kind, n: g.baris.length, teks: `Kantong baru ${g.name} (${bagian.join(", ")})`, dipilih });
      if (!dipilih) continue;
      const awal = g.baris.reduce((x, b) => (b.tanggal < x ? b.tanggal : x), g.baris[0].tanggal);
      const nomor = g.kind === "bank" ? (g.baris.map((b) => empatAkhir(b.pihak?.nomor)).find(Boolean) ?? "") : "";
      const name = namaUnik(g.name, `${g.name} (${g.kind === "ewallet" ? "e-wallet" : g.kind === "kredit" ? "paylater" : "bank"})`);
      // K1: Rp 0 sejak transaksi pertamanya (00.00 WIB); sesudah impor ditanya saldonya sekarang.
      kantongBaru.push({ kunci, name, emoji: emojiJenis(g.kind), kind: g.kind, induk_id: null, macam_simpanan: null, saldo_awal: 0, saldo_sejak: `${awal}T00:00:00+07:00`, nomor_akhir: nomor, tanyaSaldo: true });
      if (g.kind !== "kredit") semuaUang.push({ id: kunci, name, aliases: null, nomor_akhir: nomor || null });
    }
  }

  const calonPindah = kerja.filter((b) => !b.selesai && (b.gol === "transfer" || b.gol === "bayar" || b.gol === "lain"));
  // Dua sisi di berkas ini.
  for (const a of calonPindah) {
    if (a.selesai || a.nominal >= 0 || (a.rek.bank === "jago" && !a.rek.utama)) continue;
    const tujuanA = kantongLawan(a);
    const b = calonPindah
      .filter(
        (x) =>
          !x.selesai &&
          x.nominal === -a.nominal &&
          x.kantong !== a.kantong &&
          !(x.rek.bank === "jago" && !x.rek.utama) &&
          Math.abs(selisihHari(a.tanggal, x.tanggal)) <= 1 &&
          (!a.jam || !x.jam || menit(a.jam) === menit(x.jam)),
      )
      // Harus ada tanda rekening sendiri di salah satu sisi.
      .filter((x) => tujuanA === x.kantong || kantongLawan(x) === a.kantong)
      .sort((x, y) => Math.abs(selisihHari(a.tanggal, x.tanggal)) - Math.abs(selisihHari(a.tanggal, y.tanggal)))[0];
    if (!b) continue;
    hitung.pasangan++;
    const t = catatPindah(a, b, a.kantong!, b.kantong!, `Pindah ke ${namaKantong(b.kantong) ?? "kantong sendiri"}`);
    for (const [biaya, induk] of indukBiaya) if (induk === a && t) tempelBiaya(biaya, t);
  }
  /**
   * R2: pasangan baris `a` di kantong lawan `ke` yang tercatat sebagai pengeluaran (a uang
   * masuk) / pemasukan (a uang keluar) dari rekening koran: nominal sama, ±1 hari, menit sama
   * bila keduanya berjam (aturan pasangan §6); tanggal terdekat dulu.
   */
  const ubahPindah: UbahPindah[] = [];
  const cariBiasa = (a: BarisKerja, ke: RujukanKantong) =>
    lama
      .filter(
        (t) =>
          t.type === (a.nominal > 0 ? "expense" : "income") &&
          t.kantong_id === ke &&
          !t.kantong_tujuan_id &&
          !t.ref_bank_tujuan &&
          !t.induk_id &&
          (t.source == null || t.source === "statement") &&
          !ubahPindah.some((x) => x.id === t.id) &&
          Math.abs(t.n - Math.abs(a.nominal)) < 0.005 &&
          Math.abs(selisihHari(t.transaction_date, a.tanggal)) <= 1 &&
          (!a.jam || !t.waktu || menit(a.jam) === menit(t.waktu)),
      )
      .sort((x, y) => Math.abs(selisihHari(x.transaction_date, a.tanggal)) - Math.abs(selisihHari(y.transaction_date, a.tanggal)))[0];
  // Satu sisi: lawannya kantong sendiri yang belum diimpor.
  for (const a of calonPindah) {
    if (a.selesai || (a.rek.bank === "jago" && !a.rek.utama)) continue;
    const lawan = kantongLawan(a);
    const pl = !lawan ? kantongPaylater(a) : null;
    const ke = lawan ?? pl ?? null;
    if (!ke) continue;
    // R2: rekening koran kantong lawan diimpor lebih dulu, saat kantong ini belum ada —
    // pasangannya tercatat sebagai pengeluaran/pemasukan biasa. Transaksi itu diubah jadi
    // pindah kantong (aturan pasangan §6), bukan pindah kantong baru di samping transaksi lama.
    const biasa = lawan && !pl ? cariBiasa(a, ke) : undefined;
    if (biasa) {
      biasa.bebasAsal = false;
      biasa.bebasTujuan = false;
      const keluar = a.nominal < 0;
      ubahPindah.push({
        id: biasa.id,
        kantong_id: keluar ? a.kantong! : ke,
        kantong_tujuan_id: keluar ? ke : a.kantong!,
        ref_bank: keluar ? a.ref : (biasa.ref_bank ?? null),
        ref_bank_tujuan: keluar ? (biasa.ref_bank ?? null) : a.ref,
        merchant: `${keluar ? "Pindah ke" : "Pindah dari"} ${namaKantong(ke)}`,
      });
      a.selesai = true;
      const rr = ringkas.get(a.kunciRek)!;
      rr.pindah++;
      const nama = namaKantong(ke) ?? "kantong lain";
      const ada = rr.diubahPindah.find((x) => x.nama === nama);
      if (ada) ada.n++;
      else rr.diubahPindah.push({ nama, n: 1 });
      continue;
    }
    const t =
      a.nominal < 0
        ? catatPindah(a, null, a.kantong!, ke, `${pl ? "Bayar" : "Pindah ke"} ${namaKantong(ke)}`)
        : catatPindah(null, a, ke, a.kantong!, `${pl ? "Dari" : "Pindah dari"} ${namaKantong(ke)}`);
    for (const [biaya, induk] of indukBiaya) if (induk === a && t) tempelBiaya(biaya, t);
  }

  function tempelBiaya(biaya: BarisKerja, induk: TxBaru) {
    if (biaya.selesai) return;
    biaya.selesai = true;
    hitung.ikutan++;
    ringkas.get(biaya.kunciRek)!.baru++;
    sisip.push({
      kunci: kunciBaru(),
      type: "expense",
      amount: -biaya.nominal,
      category: kat("expense", "fees"),
      merchant: NAMA_BANK[biaya.rek.bank],
      description: `Biaya transfer · ${biaya.uraian}`.slice(0, 300),
      transaction_date: induk.transaction_date,
      waktu: induk.waktu,
      kantong_id: biaya.kantong!,
      kantong_tujuan_id: null,
      induk: induk.kunci,
      ref_bank: biaya.ref,
      ref_bank_tujuan: null,
      perlu_dilengkapi: false,
      urut: urutDari(biaya),
    });
  }

  // 7. Deposito SeaBank (§8): dicocokkan ke simpanan deposito di kantong SeaBank, atau ditawarkan.
  const tawaranDeposito: TawaranDeposito[] = [];
  const terbaruSea = new Map<string, { dari: string; deposito: DepositoBank[] }>();
  for (const h of m.bacaan) {
    if (h.bank !== "seabank") continue;
    const k = kunciRekening(h.rekening[0]);
    if ((terbaruSea.get(k)?.dari ?? "") <= h.rekening[0].dari) terbaruSea.set(k, { dari: h.rekening[0].dari, deposito: h.deposito });
  }
  const depositoKantong = new Map<RujukanKantong, RujukanKantong[]>();
  for (const [k, { deposito }] of terbaruSea) {
    const induk = petaRek.get(k);
    if (!induk) continue;
    for (const d of deposito) {
      const ada = kantong.find((x) => x.kind === "simpanan" && x.macam_simpanan === "deposito" && x.induk_id === induk && sama(x.name, d.nama));
      if (ada) {
        depositoKantong.set(induk, [...(depositoKantong.get(induk) ?? []), ada.id]);
        continue;
      }
      const mulai = d.satuan === "bulan" ? tambahBulan(d.jatuhTempo, -d.tenor) : tambahHari(d.jatuhTempo, -d.tenor);
      const pajakPersen = pajakBawaan(d.pokok);
      const b = hitungBunga(d.pokok, d.bunga, pajakPersen, mulai, d.jatuhTempo);
      const kunci = `deposito:${k}:${normal(d.kode ?? d.nama)}`;
      const t: TawaranDeposito = {
        kunci,
        induk_id: induk,
        name: namaUnik(d.nama, `${d.nama} ${NAMA_BANK.seabank}`),
        pokok: d.pokok,
        bunga_persen: d.bunga,
        tenor: d.tenor,
        satuan_tenor: d.satuan,
        pajak_persen: pajakPersen,
        mulai,
        jatuh_tempo: d.jatuhTempo,
        bunga_kotor: b.bunga_kotor,
        pajak: b.pajak,
        bunga_bersih: b.bunga_bersih,
        teks: `Buat ${/deposito/i.test(d.nama) ? d.nama.replace(/^Deposito\b/i, "deposito") : `deposito ${d.nama}`} ${d.tenor} ${d.satuan}, ${String(d.bunga).replace(".", ",")}%, ${ringkasRupiah(d.pokok)}?`,
      };
      tawaranDeposito.push(t);
      if (pilihan.deposito?.includes(kunci)) depositoKantong.set(induk, [...(depositoKantong.get(induk) ?? []), kunci]);
    }
  }
  const depositoBaru = tawaranDeposito.filter((t) => pilihan.deposito?.includes(t.kunci));
  // Deposito yang sudah ada di kantong itu juga tujuan penempatan, walau rekening
  // koran ini (mis. bulan penempatannya) tidak memuat tabel deposito.
  for (const k of kantong) {
    if (k.kind !== "simpanan" || k.macam_simpanan !== "deposito" || !k.induk_id) continue;
    if (daftarDeposito.some((d) => d.kantong_id === k.id && d.selesai)) continue;
    const daftar = depositoKantong.get(k.induk_id) ?? [];
    if (!daftar.includes(k.id)) depositoKantong.set(k.induk_id, [...daftar, k.id]);
  }
  /** Deposito tujuan penempatan sebesar `n`: pokok/saldo sama dulu, selain itu yang pertama. */
  const tujuanDeposito = (induk: RujukanKantong, n: number): RujukanKantong | null => {
    const daftar = depositoKantong.get(induk) ?? [];
    const pokok = (id: RujukanKantong) => depositoBaru.find((d) => d.kunci === id)?.pokok ?? Number(cariKantong(id)?.saldo_awal ?? NaN);
    return daftar.find((id) => Math.abs(pokok(id) - n) < 0.005) ?? daftar[0] ?? null;
  };
  /**
   * Deposito baru yang penempatannya ada di rekening koran: saldo awalnya 0 sejak
   * tanggal penempatan, dan pindah kantong penempatan itulah yang mengisinya
   * (seperti "sudah termasuk" di SPEC-simpanan). Tanpa ini pokoknya terhitung dua
   * kali bila penempatannya di hari impor (tanpa jam = dianggap sesudah saldo).
   */
  const didanai = (ke: RujukanKantong, tanggal: string) => {
    const d = depositoBaru.find((x) => x.kunci === ke);
    if (d && (!d.didanai || tanggal < d.didanai)) d.didanai = tanggal;
  };
  const namaDeposito = (ke: RujukanKantong) =>
    namaKantong(ke) ?? depositoBaru.find((d) => d.kunci === ke)?.name ?? daftarDeposito.find((d) => d.kantong_id === ke)?.name ?? "deposito";
  for (const a of kerja) {
    if (a.selesai || a.gol !== "deposito") continue;
    // Deposito yang dibuat manual dengan "Sudah termasuk" (SPEC-simpanan): pindah
    // kantong induk → deposito saat dibuat sudah ada. Penempatannya ditautkan ke
    // situ, tanggal berapa pun — bukan pindah kantong kedua (saldo induk dobel).
    if (a.nominal < 0) {
      const tujuan = depositoKantong.get(a.kantong!) ?? [];
      const buatan = lama
        .filter((t) => t.type === "transfer" && t.kantong_id === a.kantong && t.bebasAsal && t.kantong_tujuan_id && tujuan.includes(t.kantong_tujuan_id) && Math.abs(t.n + a.nominal) < 0.005)
        .sort((x, y) => Math.abs(selisihHari(x.transaction_date, a.tanggal)) - Math.abs(selisihHari(y.transaction_date, a.tanggal)))[0];
      if (buatan) {
        pakaiAsal(buatan, a.ref);
        tandaiTercatat(a);
        continue;
      }
    }
    // Pencairan deposito yang jatuh tempo (3b): ke deposito itu, bukan tebakan dari nominal.
    const ke = depositoKe.get(a) ?? tujuanDeposito(a.kantong!, Math.abs(a.nominal));
    if (!ke) {
      a.gol = "lain";
      continue;
    }
    if (a.nominal < 0) {
      didanai(ke, a.tanggal);
      catatPindah(a, null, a.kantong!, ke, `Pindah ke ${namaDeposito(ke)}`);
    } else catatPindah(null, a, ke, a.kantong!, `Pencairan ${namaDeposito(ke)}`);
  }
  // Penempatan yang sudah terimpor sebagai pengeluaran (rekening koran bulan
  // penempatan diimpor sebelum ada depositonya): diubah jadi pindah kantong.
  const jadiPindah: Rencana["jadiPindah"] = [];
  const hapus: string[] = [];
  for (const t of lama) {
    if (t.type !== "expense" || !t.kantong_id || !depositoKantong.has(t.kantong_id) || !t.ref_bank?.startsWith("sea:") || !/^Fund Placement$/i.test(t.merchant ?? "")) continue;
    const ke = tujuanDeposito(t.kantong_id, t.n);
    if (!ke) continue;
    // K3: deposito dibuat "Sudah termasuk" dengan tanggal mulai & pokok yang sama →
    // pindah kantong pembuatannya sudah mencatat penempatan ini; pengeluarannya dihapus
    // dan pengenal barisnya pindah ke pindah kantong itu (impor ulang tetap tidak dobel).
    const awal = daftarDeposito.find((d) => d.kantong_id === ke)?.periode.find((p) => p.ke === 1);
    const buatan =
      awal && awal.mulai === t.transaction_date && Math.abs(Number(awal.pokok) - t.n) < 0.005
        ? lama.find((x) => x.type === "transfer" && x.kantong_id === t.kantong_id && x.kantong_tujuan_id === ke && Math.abs(x.n - t.n) < 0.005 && x.bebasAsal && !x.ref_bank)
        : undefined;
    if (buatan) {
      hapus.push(t.id);
      t.bebasAsal = false;
      pakaiAsal(buatan, t.ref_bank);
      continue;
    }
    didanai(ke, t.transaction_date);
    jadiPindah.push({ id: t.id, kantong_tujuan_id: ke, merchant: `Pindah ke ${namaDeposito(ke)}` });
  }
  // Pencairan periode yang ditutup dari rekening koran: pindah kantong barunya ikut
  // transaksi_tutup, supaya Urungkan mengembalikan saldo deposito juga.
  for (const { b, t } of pencairanTutup) {
    const tx = sisip.find((x) => x.type === "transfer" && (x.ref_bank === b.ref || x.ref_bank_tujuan === b.ref));
    if (tx) t.transaksi.push(tx.kunci);
  }

  // 8. Baris lain: sudah tercatat (§5), atau transaksi baru menurut aturan kategori.
  const sisa = kerja.filter((b) => !b.selesai);
  const grup = new Map<string, number>();
  const kunciGrup = (b: BarisKerja) => `${b.kantong}|${Math.sign(b.nominal)}|${Math.abs(b.nominal)}|${b.tanggal}`;
  for (const b of sisa) grup.set(kunciGrup(b), (grup.get(kunciGrup(b)) ?? 0) + 1);
  for (const b of sisa.sort((x, y) => x.tanggal.localeCompare(y.tanggal) || x.urut - y.urut)) {
    const n = Math.abs(b.nominal);
    if (n === 0) {
      b.selesai = true;
      continue;
    }
    const kg = kunciGrup(b);
    const sisaGrup = grup.get(kg)!;
    grup.set(kg, sisaGrup - 1);
    const calon = lama.filter((t) => {
      if (Math.abs(t.n - n) >= 0.005 || Math.abs(selisihHari(t.transaction_date, b.tanggal)) > 1) return false;
      if (b.nominal < 0) return t.kantong_id === b.kantong && t.bebasAsal && (t.type === "expense" || t.type === "transfer");
      return t.bebasTujuan && t.type === "transfer" ? t.kantong_tujuan_id === b.kantong : t.bebasAsal && t.type === "income" && t.kantong_id === b.kantong;
    });
    const terdekat = Math.min(...calon.map((t) => Math.abs(selisihHari(t.transaction_date, b.tanggal))));
    const d0 = calon
      .filter((t) => Math.abs(selisihHari(t.transaction_date, b.tanggal)) === terdekat)
      .sort((x, y) => {
        const mb = menit(b.jam);
        if (mb !== null) return Math.abs((menit(x.waktu) ?? 9999) - mb) - Math.abs((menit(y.waktu) ?? 9999) - mb);
        return (menit(x.waktu) ?? 9999) - (menit(y.waktu) ?? 9999) || (x.created_at ?? "").localeCompare(y.created_at ?? "");
      });
    const jawab = pilihan.ragu?.[b.ref];
    let pilih = jawab === "baru" ? undefined : jawab ? (d0.find((t) => t.id === jawab) ?? calon.find((t) => t.id === jawab)) : d0[0];
    if (d0.length > 1 && !b.jam && d0.length > sisaGrup) {
      ragu.push({
        ref: b.ref,
        rekening: ringkas.get(b.kunciRek)!.nama,
        tanggal: b.tanggal,
        nominal: b.nominal,
        uraian: b.uraian,
        kandidat: d0.map((t) => ({
          id: t.id,
          // Jam di depan (pembedanya), tanggal hanya bila beda dari baris rekening (SPEC-perbaikan-uiux #11).
          label: [t.waktu?.slice(0, 5).replace(":", "."), t.merchant || "Tanpa nama", t.transaction_date !== b.tanggal ? t.transaction_date : null].filter(Boolean).join(" · "),
        })),
        dipilih: jawab ?? d0[0].id,
      });
    }
    if (jawab === "baru") pilih = undefined;
    if (pilih) {
      const p = pilih;
      if (b.nominal > 0 && p.type === "transfer") pakaiTujuan(p, b.ref);
      else pakaiAsal(p, b.ref);
      tandaiTercatat(b);
      continue;
    }
    sisip.push(transaksiBaru(b));
    b.selesai = true;
    ringkas.get(b.kunciRek)!.baru++;
  }

  function transaksiBaru(b: BarisKerja): TxBaru {
    const masuk = b.nominal > 0;
    const type = masuk ? "income" : "expense";
    const nama = b.pihak?.nama?.trim() || null;
    let category = "other";
    let merchant: string | null = nama;
    let perlu = true;
    switch (b.gol) {
      case "biaya":
        category = masuk ? "other" : "fees";
        merchant = NAMA_BANK[b.rek.bank];
        perlu = false;
        break;
      case "refund":
        category = masuk ? "refund" : "other";
        merchant = (nama ?? b.uraian).replace(/^Refund\s*-\s*/i, "") || null;
        perlu = !masuk;
        break;
      case "penyesuaian":
        merchant = NAMA_BANK[b.rek.bank];
        perlu = false;
        break;
      case "bayar":
        merchant = nama ?? b.pihak?.bank ?? null;
        break;
      default:
        merchant = nama ?? b.pihak?.bank ?? null;
    }
    // Kode referensi bukan judul (C-2); kodenya tetap di keterangan (uraian).
    if (perlu) merchant = bersihkanMerchant(merchant).nama;
    if (!merchant) merchant = b.uraian.slice(0, 60) || NAMA_BANK[b.rek.bank];
    const r = ringkas.get(b.kunciRek)!;
    let kelompok: string | null = null;
    let diingat = false;
    if (perlu) {
      // GoPay lewat Jago Pay: kategori dari layanannya, aturan tetap (C-2).
      const layanan = !masuk ? kategoriLayanan(merchant) : null;
      if (layanan && layanan !== "other") {
        category = layanan;
        perlu = false;
      }
      // Ingat kategori (C-1): merchant yang sama pernah dikategorikan user (bukan Lainnya) →
      // kategori itu, tanpa tanda Perlu dilengkapi (K2). Boleh menimpa aturan layanan.
      const ingat = m.ingatan ? ingatKategori(m.ingatan, merchant, type) : null;
      if (ingat && kategoriAda(type, ingat.category)) {
        category = ingat.category;
        kelompok = type === "expense" ? ingat.kelompok : null;
        perlu = false;
        r.dariIngatan++;
        diingat = true;
      }
    }
    if (perlu) r.perluDilengkapi++;
    const kunci = kunciBaru();
    if (diingat) dariIngatan.push(kunci);
    return {
      kunci,
      type,
      amount: Math.abs(b.nominal),
      category: kat(type, category),
      kelompok,
      merchant: merchant.slice(0, 100),
      description: [b.uraian, b.catatan].filter(Boolean).join(" · ").slice(0, 300) || null,
      transaction_date: b.tanggal,
      waktu: b.jam,
      kantong_id: b.kantong!,
      kantong_tujuan_id: null,
      induk: null,
      ref_bank: b.ref,
      ref_bank_tujuan: null,
      perlu_dilengkapi: perlu,
      urut: urutDari(b),
    };
  }

  // 9. Saldo kantong di akhir periode sesudah impor (§7) & tawaran menyamakan (K4).
  const saldoRencana: Rencana["saldo"] = [];
  const efek = (t: { type: string; amount: number | string; kantong_id: string | null; kantong_tujuan_id: string | null }, id: string) => {
    const n = Number(t.amount);
    if (t.type === "income") return t.kantong_id === id ? n : 0;
    if (t.type === "expense") return t.kantong_id === id ? -n : 0;
    return (t.kantong_tujuan_id === id ? n : 0) - (t.kantong_id === id ? n : 0);
  };
  // Keadaan sesudah impor (R1): transaksi lama dengan perubahan rencana ini (dihapus,
  // diubah jadi pindah kantong, bunga diperbarui) + transaksi baru.
  const semuaTx = [
    ...lama
      .filter((t) => !hapus.includes(t.id))
      .map((t) => {
        const jp = jadiPindah.find((x) => x.id === t.id);
        const up = ubahPindah.find((x) => x.id === t.id);
        const pb = perbarui.find((x) => x.id === t.id);
        return {
          ...t,
          ...(pb ? { amount: pb.amount } : {}),
          ...(jp ? { type: "transfer", kantong_tujuan_id: jp.kantong_tujuan_id } : {}),
          ...(up ? { type: "transfer", kantong_id: up.kantong_id, kantong_tujuan_id: up.kantong_tujuan_id } : {}),
        };
      }),
    ...sisip,
  ];
  for (const r of ringkas.values()) {
    if (!r.kantong) continue;
    const baru = kantongBaru.find((k) => k.kunci === r.kantong);
    const k = cariKantong(r.kantong);
    const terkait = semuaTx.filter((t) => t.kantong_id === r.kantong || t.kantong_tujuan_id === r.kantong);
    const dalamPeriode = terkait.filter((t) => t.transaction_date >= r.dari && t.transaction_date <= r.sampai).reduce((n, t) => n + efek(t, r.kantong!), 0);
    if (baru) {
      // Kantong baru: saldo awal = saldo awal rekening koran pertama → akhir periode pasti sama.
      r.saldoAplikasi = baru.saldo_sejak ? sen(baru.saldo_awal + dalamPeriode) : r.saldoBank;
      continue;
    }
    if (!k) continue;
    // U1: kantong yang dibuat di tempat (saldo Rp 0 sementara) menerima rekening koran banknya
    // sendiri untuk pertama kali → saldo awal = saldo awal bank di awal periode, seperti kantong
    // yang dibuat oleh impor. Transaksi yang sudah ada tetap (yang sebelum periode sudah
    // termasuk di saldo bank). Tanpa peringatan & Samakan.
    if (k.saldo_sementara && r.utama && KANTONG_UANG.has(k.kind)) {
      const awal = [...rekMap.get(r.kunci)!.semua].sort((a, b) => a.dari.localeCompare(b.dari))[0];
      saldoRencana.push({ kantong_id: r.kantong, saldo_awal: awal.saldoAwal, saldo_sejak: `${awal.dari}T00:00:00+07:00` });
      r.saldoAplikasi = sen(awal.saldoAwal + dalamPeriode);
      r.saldoDariRekening = true;
      continue;
    }
    const sejak: SaldoSejak = saldoSejak({ saldo_per: k.saldo_per ?? "1970-01-01", saldo_sejak: k.saldo_sejak });
    const akhir = { tanggal: r.sampai, jam: "23:59" };
    const sebelumAkhir = (t: { transaction_date: string; waktu?: string | null }) => t.transaction_date <= r.sampai;
    let saldo: number;
    if (sejak.tanggal <= akhir.tanggal) {
      // R1: transaksi sebelum rentang yang dimuat (sejak sehari sebelum periode) tetap
      // terhitung — dari saldo kantong sekarang dikurangi yang dimuat.
      const id = r.kantong;
      const sebelumnya =
        m.saldoSekarang && id in m.saldoSekarang
          ? m.saldoSekarang[id] - Number(k.saldo_awal ?? 0) - m.transaksi.filter((t) => ikutSaldo(t, sejak)).reduce((n, t) => n + efek(t, id), 0)
          : 0;
      saldo = Number(k.saldo_awal ?? 0) + sebelumnya + terkait.filter((t) => sebelumAkhir(t) && ikutSaldo(t, sejak)).reduce((n, t) => n + efek(t, r.kantong!), 0);
    } else {
      // Saldo kantong diisi sesudah periode: mundur dari saldo itu.
      saldo = Number(k.saldo_awal ?? 0) - terkait.filter((t) => !sebelumAkhir(t) && !ikutSaldo(t, sejak)).reduce((n, t) => n + efek(t, r.kantong!), 0);
    }
    r.saldoAplikasi = sen(saldo);
    if (Math.abs(r.saldoAplikasi - r.saldoBank) >= 0.005) {
      const saldo_awal = sen(r.saldoBank - dalamPeriode);
      const saldo_sejak = `${r.dari}T00:00:00+07:00`;
      r.samakan = { saldo_awal, saldo_sejak, teks: `Samakan saldo awal ${r.namaKantong ?? r.nama} supaya akhir ${labelBulanPanjang(r.sampai)} = ${fmtIDR(r.saldoBank)}` };
      if (pilihan.samakan?.includes(r.kunci)) {
        saldoRencana.push({ kantong_id: r.kantong, saldo_awal, saldo_sejak });
        r.saldoAplikasi = r.saldoBank;
      }
    }
  }

  // Ringkasan keseluruhan (diagnostik & uji).
  const perKategori: Record<string, number> = {};
  for (const t of sisip) {
    const k = t.type === "transfer" ? "pindah" : `${t.type === "income" ? "masuk" : "keluar"}:${t.category}`;
    perKategori[k] = (perKategori[k] ?? 0) + 1;
  }
  const rek = [...ringkas.values()];
  return {
    rekening: rek,
    belumDipetakan,
    kantongBaru,
    nomorAkhir: [...nomorAkhir].map(([id, nomor_akhir]) => ({ id, nomor_akhir })),
    tawaranDeposito,
    tawaranKantong,
    depositoBaru,
    saldo: saldoRencana,
    sisip,
    tautkan,
    perbarui,
    jadiPindah,
    ubahPindah,
    hapus,
    tawaranJadikan,
    jadikan,
    tutup,
    sesuaikan,
    ragu,
    barisBank: kerja.map((b) => ({ ref: b.ref, kunciRek: b.kunciRek, tanggal: b.tanggal, jam: b.jam, uraian: b.uraian, nominal: b.nominal })),
    dariIngatan,
    refDeposito: [...milikDeposito].map((b) => b.ref),
    ringkas: {
      baris: kerja.length,
      dobel,
      baru: sisip.length,
      tercatat: rek.reduce((n, r) => n + r.tercatat, 0),
      pindah: sisip.filter((t) => t.type === "transfer").length,
      pasangan: hitung.pasangan,
      antarJago: hitung.antarJago,
      barisBunga,
      bunga: rek.reduce((n, r) => n + r.bunga, 0),
      perluDilengkapi: sisip.filter((t) => t.perlu_dilengkapi).length,
      dariIngatan: rek.reduce((n, r) => n + r.dariIngatan, 0),
      cicilan: rek.reduce((n, r) => n + r.cicilan, 0),
      ikutan: hitung.ikutan,
      perKategori,
    },
  };
}

/** Isian "Jadikan deposito?" (K2): sama dengan batas form deposito (validasiDeposito). */
function cekJadikan(i: IsianJadikan, mulai: string | null, pokok: number | null): string | null {
  if (!(i.bunga_persen > 0)) return "Bunganya diisi dulu, mis. 4,5.";
  if (i.bunga_persen > 25) return "Bunganya maksimal 25% per tahun.";
  if (i.satuan_tenor !== "hari" && i.satuan_tenor !== "bulan") return "Pilih tenornya.";
  if (!Number.isInteger(i.tenor) || i.tenor < 1) return "Tenornya minimal 1 hari.";
  if (i.tenor > (i.satuan_tenor === "hari" ? 3660 : 120)) return "Tenornya kepanjangan, maksimal 10 tahun.";
  if (!["sekali", "pokok", "pokok_bunga"].includes(i.perpanjangan)) return "Pilih perpanjangannya.";
  if (!mulai || !/^\d{4}-\d{2}-\d{2}$/.test(mulai) || Number.isNaN(Date.parse(`${mulai}T00:00:00Z`))) return "Tanggal mulainya diisi dulu.";
  if (!pokok || pokok <= 0) return "Pokoknya tidak terbaca: penempatannya tidak ada di rekening koran ini.";
  return null;
}

const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** "2026-09-30" → "September" (tahun disebut bila bukan tahun ini). */
export const labelBulanPanjang = (iso: string, sekarang = new Date()) =>
  `${BULAN_PANJANG[Number(iso.slice(5, 7)) - 1]}${iso.slice(0, 4) === String(sekarang.getFullYear()) ? "" : ` ${iso.slice(0, 4)}`}`;

/** "Rp 2 jt", "Rp 1,5 jt", "Rp 750 rb". */
export const ringkasRupiah = (n: number) =>
  n >= 1_000_000 ? `Rp ${String(Math.round(n / 100_000) / 10).replace(".", ",")} jt` : n >= 1_000 ? `Rp ${Math.round(n / 1_000)} rb` : fmtIDR(n);
