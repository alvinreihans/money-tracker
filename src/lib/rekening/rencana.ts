import { cocokkanKantong, normal } from "@/lib/kantong";
import { namaRekening } from "@/lib/rekening/baca";
import { NAMA_BANK, type Bank, type BarisBank, type DepositoBank, type HasilBaca, type RekeningBank } from "@/lib/rekening/jenis";
import { empatAkhir, selisihHari, sen } from "@/lib/rekening/teks";
import { hitungBunga, pajakBawaan, tambahBulan, tambahHari } from "@/lib/simpanan";
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
}

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
  kind: "bank" | "simpanan";
  induk_id: RujukanKantong | null;
  macam_simpanan: "tabungan" | null;
  saldo_awal: number;
  /** null = sekarang (saat impor). */
  saldo_sejak: string | null;
  nomor_akhir: string;
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
  saldoBank: number;
  /** Saldo kantong di akhir periode menurut aplikasi sesudah impor; null bila belum dipetakan. */
  saldoAplikasi: number | null;
  /** Tawaran K4 bila beda. */
  samakan: { saldo_awal: number; saldo_sejak: string; teks: string } | null;
}

export interface Rencana {
  rekening: RingkasRekening[];
  /** Rekening yang belum punya kantong; yang ditanyakan hanya `utama` (kantong Jago lain ikut Jago-nya). */
  belumDipetakan: { kunci: string; nama: string; bank: Bank; nomorAkhir: string; utama: boolean }[];
  kantongBaru: KantongBaru[];
  nomorAkhir: { id: string; nomor_akhir: string }[];
  tawaranDeposito: TawaranDeposito[];
  /** Tawaran deposito yang diterima: dibuat saat impor. */
  depositoBaru: TawaranDeposito[];
  saldo: { kantong_id: RujukanKantong; saldo_awal: number; saldo_sejak: string }[];
  sisip: TxBaru[];
  tautkan: { id: string; ref_bank?: string; ref_bank_tujuan?: string }[];
  perbarui: { id: string; amount: number; description: string }[];
  /** Pengeluaran penempatan deposito dari impor sebelumnya → pindah kantong ke depositonya. */
  jadiPindah: { id: string; kantong_tujuan_id: RujukanKantong; merchant: string }[];
  ragu: Ragu[];
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

const PAYLATER = /\b(SPinjam|SPayLater|Shopee ?PayLater)\b/i;

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
      saldoBank: urut.reduce((x, y) => (y.sampai >= x.sampai ? y : x)).saldoAkhir,
      saldoAplikasi: null,
      samakan: null,
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

  // 4. Bunga & pajak: digabung satu pemasukan bersih per bulan per rekening (K2).
  const bungaPerBulan = new Map<string, BarisKerja[]>();
  for (const b of kerja) {
    if (b.gol !== "bunga" && b.gol !== "pajak") continue;
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
    if (bersih <= 0) continue;
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
  /** Kantong sendiri yang dituju baris ini: dari 4 digit akhir nomor lawan, atau nama bank/e-wallet bila nama pihaknya pemilik. */
  const kantongLawan = (b: BarisKerja): RujukanKantong | null => {
    const akhir = empatAkhir(b.pihak?.nomor);
    const bank = b.pihak?.bank;
    const lain = semuaUang.filter((x) => x.id !== b.kantong);
    const menurutNama = bank ? cocokkanKantong(bank, lain) : null;
    const menurutNomor = akhir ? lain.find((x) => nomorKantong(x.id) === akhir) : undefined;
    // Nomor cocok dan nama banknya tidak menyebut kantong lain (nomor HP e-wallet
    // bisa kebetulan berakhiran sama dengan nomor rekening).
    if (menurutNomor && (!menurutNama || menurutNama.id === menurutNomor.id)) return menurutNomor.id;
    const milikSendiri = samaPemilik(b.pihak?.nama, b.pemilik) || (b.rek.bank === "bri" && /^Top Up/i.test(b.uraian) && samaPemilik(b.uraian.replace(/^Top Up \S+ \S+ /i, "").replace(/ via BRImo$/i, ""), b.pemilik));
    if (!milikSendiri || !menurutNama) return null;
    // Kantong yang namanya cocok tapi nomornya lain: rekening lain di bank yang sama.
    const nomor = nomorKantong(menurutNama.id);
    return !akhir || !nomor || nomor === akhir ? menurutNama.id : null;
  };
  // Kantong orang/kartu untuk SPinjam / SPayLater.
  const kantongPaylater = (b: BarisKerja) => {
    const m2 = `${b.uraian} ${b.pihak?.nama ?? ""}`.match(PAYLATER);
    return m2 ? (kantong.find((k) => (k.kind === "orang" || k.kind === "kredit") && normal(k.name).includes(normal(m2[1]))) ?? null) : null;
  };

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
  // Satu sisi: lawannya kantong sendiri yang belum diimpor.
  for (const a of calonPindah) {
    if (a.selesai || (a.rek.bank === "jago" && !a.rek.utama)) continue;
    const lawan = kantongLawan(a);
    const pl = !lawan ? kantongPaylater(a) : null;
    const ke = lawan ?? pl?.id ?? null;
    if (!ke) continue;
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
  const namaDeposito = (ke: RujukanKantong) => namaKantong(ke) ?? depositoBaru.find((d) => d.kunci === ke)?.name ?? "deposito";
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
    const ke = tujuanDeposito(a.kantong!, Math.abs(a.nominal));
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
  for (const t of lama) {
    if (t.type !== "expense" || !t.kantong_id || !depositoKantong.has(t.kantong_id) || !t.ref_bank?.startsWith("sea:") || !/^Fund Placement$/i.test(t.merchant ?? "")) continue;
    const ke = tujuanDeposito(t.kantong_id, t.n);
    if (!ke) continue;
    didanai(ke, t.transaction_date);
    jadiPindah.push({ id: t.id, kantong_tujuan_id: ke, merchant: `Pindah ke ${namaDeposito(ke)}` });
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
    if (!merchant) merchant = b.uraian.slice(0, 60) || NAMA_BANK[b.rek.bank];
    const r = ringkas.get(b.kunciRek)!;
    if (perlu) r.perluDilengkapi++;
    return {
      kunci: kunciBaru(),
      type,
      amount: Math.abs(b.nominal),
      category: kat(type, category),
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
  const semuaTx = [...lama, ...sisip];
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
    const sejak: SaldoSejak = saldoSejak({ saldo_per: k.saldo_per ?? "1970-01-01", saldo_sejak: k.saldo_sejak });
    const akhir = { tanggal: r.sampai, jam: "23:59" };
    const sebelumAkhir = (t: { transaction_date: string; waktu?: string | null }) => t.transaction_date <= r.sampai;
    let saldo: number;
    if (sejak.tanggal <= akhir.tanggal) {
      saldo = Number(k.saldo_awal ?? 0) + terkait.filter((t) => sebelumAkhir(t) && ikutSaldo(t, sejak)).reduce((n, t) => n + efek(t, r.kantong!), 0);
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
    depositoBaru,
    saldo: saldoRencana,
    sisip,
    tautkan,
    perbarui,
    jadiPindah,
    ragu,
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
      ikutan: hitung.ikutan,
      perKategori,
    },
  };
}

const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** "2026-09-30" → "September" (tahun disebut bila bukan tahun ini). */
export const labelBulanPanjang = (iso: string, sekarang = new Date()) =>
  `${BULAN_PANJANG[Number(iso.slice(5, 7)) - 1]}${iso.slice(0, 4) === String(sekarang.getFullYear()) ? "" : ` ${iso.slice(0, 4)}`}`;

/** "Rp 2 jt", "Rp 1,5 jt", "Rp 750 rb". */
export const ringkasRupiah = (n: number) =>
  n >= 1_000_000 ? `Rp ${String(Math.round(n / 100_000) / 10).replace(".", ",")} jt` : n >= 1_000 ? `Rp ${Math.round(n / 1_000)} rb` : fmtIDR(n);
