import { kantongBank } from "@/lib/arah";
import { hitungSaldo, type Kantong } from "@/lib/kantong";
import { namaLembaga } from "@/lib/lembaga";
import { cariCalonPindah, type KantongPindah, type TransaksiPindah } from "@/lib/pindah";
import { NAMA_BANK, type Bank } from "@/lib/rekening/jenis";
import { selisihHari } from "@/lib/rekening/teks";

/**
 * Alat periksa asisten (SPEC-asisten-agen §2): `periksa_saldo` dan
 * `cari_kejanggalan` dihitung kode, bukan AI. Fungsi murni — datanya dimuat
 * src/lib/tanya-server.ts lewat sesi user (RLS). Diuji di scripts/uji-agen.mts.
 *
 * Saldo bank tidak disimpan saat impor; yang tersimpan adalah pengenal baris
 * rekening koran (`ref_bank`), yang untuk BRI, Jago, dan SeaBank memuat saldo
 * sesudah baris itu: `bank:nomor:tanggal[Tjam]:nominal:saldo`. Saldo bank
 * terakhir = saldo di baris rekening koran terakhir kantong itu.
 */

export interface TxPeriksa {
  id: string;
  amount: number | string;
  type: string;
  status?: string | null;
  source?: string | null;
  merchant?: string | null;
  description?: string | null;
  category?: string | null;
  kantong_id: string | null;
  kantong_tujuan_id: string | null;
  transaction_date: string;
  waktu?: string | null;
  created_at?: string | null;
  updated_at: string;
  ref_bank?: string | null;
  ref_bank_tujuan?: string | null;
  induk_id?: string | null;
  cicilan_id?: string | null;
  pecahan_dari?: string | null;
  perlu_dilengkapi?: boolean | null;
}

export type KantongPeriksa = Pick<Kantong, "id" | "name" | "kind" | "aliases" | "saldo_awal" | "saldo_per" | "saldo_sejak" | "induk_id" | "nomor_akhir">;

/** Baris rekening koran dari pengenalnya; null untuk pengenal tanpa saldo (bunga bulanan, Jago tanpa saldo). */
export interface BarisRef {
  bank: string;
  tanggal: string;
  jam: string | null;
  nominal: number;
  saldo: number;
}

export function bacaRef(ref: string | null | undefined): BarisRef | null {
  if (!ref) return null;
  const p = ref.split(":");
  if (p.length < 5) return null;
  const saldo = Number(p[p.length - 1]);
  const nominal = Number(p[p.length - 2]);
  const waktu = p.slice(2, -2).join(":");
  const m = waktu.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?)?)?$/);
  if (!m || !Number.isFinite(saldo) || !Number.isFinite(nominal)) return null;
  return { bank: p[0], tanggal: m[1], jam: m[2] ? m[2].slice(0, 5) : null, nominal, saldo };
}

/** "sea" → "SeaBank" (awalan ref_bank). */
export const namaBankRef = (awalan: string) => {
  const peta: Record<string, Bank> = { sea: "seabank", seabank: "seabank", jago: "jago", bri: "bri" };
  return peta[awalan] ? NAMA_BANK[peta[awalan]] : awalan;
};

const angka = (t: { amount: number | string }) => Number(t.amount);
const tercatat = (t: TxPeriksa) => (t.status ?? "confirmed") === "confirmed";
const ringkasTx = (t: TxPeriksa, nama: (id: string | null) => string | null) => ({
  id: t.id,
  tanggal: t.transaction_date,
  ...(t.waktu ? { jam: t.waktu.slice(0, 5) } : {}),
  jenis: t.type === "expense" ? "keluar" : t.type === "income" ? "masuk" : "pindah",
  nominal: angka(t),
  merchant: t.merchant ?? null,
  kantong: nama(t.kantong_id),
  ...(t.kantong_tujuan_id ? { ke_kantong: nama(t.kantong_tujuan_id) } : {}),
  sumber: t.source ?? null,
});

/** Pengaruh transaksi ke saldo kantong `id` (aturan RPC saldo_kantong). */
export function pengaruh(t: TxPeriksa, id: string): number {
  const n = angka(t);
  let d = 0;
  if (t.kantong_id === id) d += t.type === "income" ? n : t.type === "expense" || t.type === "transfer" ? -n : 0;
  if (t.kantong_tujuan_id === id && t.type === "transfer") d += n;
  return d;
}

/** Sisi kantong `id` pada transaksi ini membawa pengenal rekening koran. */
const refSisi = (t: TxPeriksa, id: string) => (t.kantong_id === id ? t.ref_bank : t.kantong_tujuan_id === id ? t.ref_bank_tujuan : null) ?? null;

/** Sesudah (tanggal, jam): tanggal lebih besar, atau tanggal sama dan keduanya berjam dengan jam lebih besar. */
const sesudah = (t: { transaction_date: string; waktu?: string | null }, tanggal: string, jam: string | null) =>
  t.transaction_date > tanggal || (t.transaction_date === tanggal && Boolean(jam) && Boolean(t.waktu) && t.waktu!.slice(0, 5) > jam!);

/**
 * Calon dobel: dua transaksi tercatat di kantong yang sama, jenis & nominal sama,
 * tanggal ±1 hari, dan asalnya beda (sumber beda, atau satu dari rekening koran dan
 * satu bukan). Ikutan, cicilan, dan bagian pecahan tidak ikut.
 */
export function cariDobel(transaksi: TxPeriksa[], kantongId?: string): [TxPeriksa, TxPeriksa][] {
  const bebas = transaksi.filter((t) => tercatat(t) && !t.induk_id && !t.pecahan_dari && t.kantong_id && (!kantongId || t.kantong_id === kantongId || t.kantong_tujuan_id === kantongId));
  const kelompok = new Map<string, TxPeriksa[]>();
  for (const t of bebas) {
    const k = `${t.kantong_id}|${t.kantong_tujuan_id ?? ""}|${t.type}|${angka(t).toFixed(2)}`;
    (kelompok.get(k) ?? kelompok.set(k, []).get(k)!).push(t);
  }
  const hasil: [TxPeriksa, TxPeriksa][] = [];
  const terpakai = new Set<string>();
  for (const isi of kelompok.values()) {
    if (isi.length < 2) continue;
    isi.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    for (let i = 0; i < isi.length; i++) {
      for (let j = i + 1; j < isi.length; j++) {
        const [a, b] = [isi[i], isi[j]];
        if (terpakai.has(a.id) || terpakai.has(b.id)) continue;
        if (Math.abs(selisihHari(a.transaction_date, b.transaction_date)) > 1) break;
        const asalBeda = (a.source ?? "") !== (b.source ?? "") || Boolean(a.ref_bank) !== Boolean(b.ref_bank);
        // Dua baris rekening koran yang sama-sama berpengenal adalah dua baris bank sungguhan.
        if (!asalBeda) continue;
        terpakai.add(a.id).add(b.id);
        hasil.push([a, b]);
      }
    }
  }
  return hasil;
}

/**
 * Pindah kantong yang tercatat sebagai dua transaksi lepas: pengeluaran di satu kantong uang
 * dan pemasukan bernominal sama di kantong uang lain (±1 hari). Satu perpindahan jadi
 * keluar + masuk, sehingga laporan pengeluaran & pemasukan sama-sama menggelembung.
 */
export function cariPindahLepas(transaksi: TxPeriksa[], uang: Set<string>, kantongId?: string): [TxPeriksa, TxPeriksa][] {
  const bebas = (t: TxPeriksa) => tercatat(t) && !t.induk_id && !t.pecahan_dari && !t.cicilan_id && !t.kantong_tujuan_id && t.kantong_id && uang.has(t.kantong_id);
  const keluar = transaksi.filter((t) => bebas(t) && t.type === "expense");
  const masuk = transaksi.filter((t) => bebas(t) && t.type === "income");
  const terpakai = new Set<string>();
  const hasil: [TxPeriksa, TxPeriksa][] = [];
  for (const k of keluar.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))) {
    const m = masuk.find(
      (x) =>
        !terpakai.has(x.id) &&
        x.kantong_id !== k.kantong_id &&
        Math.abs(angka(x) - angka(k)) < 0.005 &&
        Math.abs(selisihHari(x.transaction_date, k.transaction_date)) <= 1 &&
        (!kantongId || x.kantong_id === kantongId || k.kantong_id === kantongId),
    );
    if (m) {
      terpakai.add(m.id);
      hasil.push([k, m]);
    }
  }
  return hasil;
}

/** Kata yang menandai isi saldo ke rekening/dompet lain. */
const TOP_UP = /\btop\s*-?\s*up\b|\bisi\s*saldo\b|\btopup\b/i;

/**
 * Top up e-wallet/bank yang kantongnya belum ada: pengeluaran tercatat yang teksnya
 * menyebut top up / isi saldo ke lembaga yang dikenal (DANA, GoPay, …), sedangkan
 * user tidak punya kantong bernama/beralias itu. Uangnya masih milik user, jadi
 * bukan pengeluaran: seharusnya pindah ke kantong itu.
 */
export function cariTopUpTanpaKantong(transaksi: TxPeriksa[], kantong: Pick<KantongPeriksa, "name" | "aliases">[]) {
  const per = new Map<string, TxPeriksa[]>();
  for (const t of transaksi) {
    if (!tercatat(t) || t.type !== "expense" || t.induk_id || t.pecahan_dari) continue;
    const teks = `${t.merchant ?? ""} ${t.description ?? ""}`;
    if (!TOP_UP.test(teks)) continue;
    const lembaga = namaLembaga(teks.replace(TOP_UP, " ").replace(/\bvia\s+\S+/gi, " "));
    if (!lembaga || kantongBank(lembaga, kantong)) continue;
    (per.get(lembaga) ?? per.set(lembaga, []).get(lembaga)!).push(t);
  }
  return [...per].map(([lembaga, isi]) => ({ lembaga, isi }));
}

export interface MasukanPeriksaSaldo {
  kantong: KantongPeriksa;
  semuaKantong: KantongPeriksa[];
  /** Semua transaksi (status apa pun) yang menyentuh kantong ini, plus transaksi rekening koran kantong lain (untuk calon pindah). */
  transaksi: TxPeriksa[];
  saldoSekarang: number;
  namaUser: string[];
  /** Saldo menurut bank yang disebut user (opsional), dibandingkan dengan saldo aplikasi pada `sampai` atau sekarang. */
  saldoBank?: number | null;
  sampai?: string | null;
}

const MAKS_CONTOH = 10;

/**
 * periksa_saldo (SPEC-asisten-agen §2): saldo aplikasi vs saldo bank terakhir dari
 * rekening koran (atau angka bank yang disebut user), selisihnya, dan calon penyebab:
 * dobel, pindah kantong lepas, pengeluaran yang tampaknya pindah ke/dari kantong sendiri
 * (cariCalonPindah, logika SPEC-kantong-sendiri A-3 & impor R2), pindah kantong tanpa
 * baris di rekening koran kantong ini, transaksi sesudah rekening koran terakhir, dan
 * draft yang belum dihitung. `cocok_dengan_selisih` = nominal/jumlahnya persis selisih.
 */
export function periksaSaldo(m: MasukanPeriksaSaldo) {
  const k = m.kantong;
  const nama = (id: string | null) => m.semuaKantong.find((x) => x.id === id)?.name ?? null;
  const sentuh = m.transaksi.filter((t) => t.kantong_id === k.id || t.kantong_tujuan_id === k.id);
  const sah = sentuh.filter(tercatat);

  // Rekening koran terakhir kantong ini: pengenal bersaldo dengan tanggal, jam, lalu urutan simpan terbesar.
  const barisBank = sah
    .map((t) => ({ t, r: bacaRef(refSisi(t, k.id)) }))
    .filter((x): x is { t: TxPeriksa; r: BarisRef } => Boolean(x.r))
    .sort((a, b) => a.r.tanggal.localeCompare(b.r.tanggal) || (a.r.jam ?? "").localeCompare(b.r.jam ?? "") || (a.t.created_at ?? "").localeCompare(b.t.created_at ?? ""));
  const terakhir = barisBank.at(-1) ?? null;
  const awal = barisBank[0] ?? null;

  // Saldo aplikasi pada suatu titik: hanya transaksi sampai titik itu (aturan saldo_kantong).
  const saldoPada = (tanggal: string, jam: string | null) => {
    if (tanggal < k.saldo_per) return null;
    const sampai = sah.filter((t) => !sesudah(t, tanggal, jam));
    return hitungSaldo([k as Kantong], sampai)[0].saldo;
  };

  // Titik banding: saldo bank yang disebut user (pada `sampai` atau sekarang), atau baris
  // rekening koran terakhir (sampai `sampai` bila diisi).
  const acuan = (m.sampai ? barisBank.filter((x) => x.r.tanggal <= m.sampai!) : barisBank).at(-1) ?? null;
  let titik: { tanggal: string; jam: string | null } | null = m.sampai ? { tanggal: m.sampai, jam: null } : null;
  let saldoBank: number | null = null;
  if (m.saldoBank != null) saldoBank = m.saldoBank;
  else if (acuan) {
    saldoBank = acuan.r.saldo;
    titik = { tanggal: acuan.r.tanggal, jam: acuan.r.jam };
  }
  const saldoAplikasiTitik = titik ? saldoPada(titik.tanggal, titik.jam) : m.saldoSekarang;
  const selisih = saldoBank != null && saldoAplikasiTitik != null ? Math.round((saldoAplikasiTitik - saldoBank) * 100) / 100 : null;
  const cocok = (n: number) => selisih != null && selisih !== 0 && Math.abs(Math.abs(n) - Math.abs(selisih)) < 0.005;

  const penyebab: Record<string, unknown>[] = [];
  const tambah = (jenis: string, keterangan: string, isi: { total: number; contoh: unknown[]; jumlah: number }) => {
    if (!isi.jumlah) return;
    penyebab.push({ jenis, keterangan, jumlah_transaksi: isi.jumlah, total: isi.total, ...(cocok(isi.total) ? { cocok_dengan_selisih: true } : {}), contoh: isi.contoh.slice(0, MAKS_CONTOH) });
  };

  const dobel = cariDobel(m.transaksi, k.id);
  tambah("dobel", "Transaksi yang tampaknya tercatat dua kali (nominal & tanggal sama, asal beda). Satu di antaranya menambah/mengurangi saldo dua kali.", {
    jumlah: dobel.length,
    total: dobel.reduce((n, [a]) => n + Math.abs(pengaruh(a, k.id)), 0),
    contoh: dobel.map(([a, b]) => ({ pertama: ringkasTx(a, nama), kedua: ringkasTx(b, nama), ...(cocok(pengaruh(a, k.id)) ? { cocok_dengan_selisih: true } : {}) })),
  });

  const uang = new Set(m.semuaKantong.filter((x) => ["bank", "ewallet", "cash", "simpanan", "tujuan"].includes(x.kind)).map((x) => x.id));
  const lepas = cariPindahLepas(m.transaksi, uang, k.id);
  tambah("pindah_lepas", "Pindah antar kantong sendiri yang tercatat sebagai pengeluaran di satu kantong dan pemasukan di kantong lain (seharusnya satu pindah kantong).", {
    jumlah: lepas.length,
    total: lepas.reduce((n, [a]) => n + angka(a), 0),
    contoh: lepas.map(([a, b]) => ({ keluar: ringkasTx(a, nama), masuk: ringkasTx(b, nama) })),
  });

  // Pengeluaran/pemasukan rekening koran yang tampaknya pindah ke/dari kantong sendiri.
  const ctx = { namaUser: m.namaUser };
  const kePindah = cariCalonPindah(k as KantongPindah, m.transaksi as TransaksiPindah[], ctx);
  const dariSini = m.semuaKantong
    .filter((x) => x.id !== k.id && ["bank", "ewallet", "cash"].includes(x.kind))
    .flatMap((x) => cariCalonPindah(x as KantongPindah, sentuh as TransaksiPindah[], ctx).filter((c) => c.kantong_id === k.id).map((c) => ({ c, ke: x.name })));
  const calon = [
    ...kePindah.map((c) => ({ id: c.id, tanggal: c.transaction_date, nominal: c.amount, merchant: c.merchant, kantong: nama(c.kantong_id), sebenarnya: `${c.arah === "ke" ? "pindah ke" : "pindah dari"} ${k.name}`, sisi_lain_sudah_tercatat: Boolean(c.gabung) })),
    ...dariSini.map(({ c, ke }) => ({ id: c.id, tanggal: c.transaction_date, nominal: c.amount, merchant: c.merchant, kantong: k.name, sebenarnya: `${c.arah === "ke" ? "pindah ke" : "pindah dari"} ${ke}`, sisi_lain_sudah_tercatat: Boolean(c.gabung) })),
  ];
  tambah("tampak_pindah_kantong_sendiri", "Pengeluaran/pemasukan dari rekening koran yang tampaknya pindah ke/dari rekening sendiri (nama atau 4 digit akhir rekening user).", {
    jumlah: calon.length,
    total: calon.reduce((n, c) => n + c.nominal, 0),
    contoh: calon,
  });

  // Pindah kantong yang menyentuh kantong ini di dalam rentang rekening korannya, tapi tanpa baris bank di sisi kantong ini.
  if (awal && terakhir) {
    const tanpaBaris = sah.filter(
      (t) => t.type === "transfer" && !refSisi(t, k.id) && t.transaction_date >= awal.r.tanggal && t.transaction_date <= terakhir.r.tanggal && !t.induk_id,
    );
    tambah("pindah_tanpa_baris_bank", `Pindah kantong yang tercatat di rentang rekening koran ${k.name} (${awal.r.tanggal} s.d. ${terakhir.r.tanggal}) tapi tidak ada barisnya di rekening koran itu.`, {
      jumlah: tanpaBaris.length,
      total: tanpaBaris.reduce((n, t) => n + pengaruh(t, k.id), 0),
      contoh: tanpaBaris.map((t) => ringkasTx(t, nama)),
    });
  }

  if (terakhir && m.saldoBank != null && !titik) {
    const lewat = sah.filter((t) => sesudah(t, terakhir.r.tanggal, terakhir.r.jam) && !refSisi(t, k.id));
    tambah("sesudah_rekening_koran", `Transaksi sesudah baris rekening koran terakhir (${terakhir.r.tanggal}); belum terlihat di rekening koran mana pun.`, {
      jumlah: lewat.length,
      total: lewat.reduce((n, t) => n + pengaruh(t, k.id), 0),
      contoh: lewat.map((t) => ({ ...ringkasTx(t, nama), pengaruh_ke_saldo: pengaruh(t, k.id) })),
    });
  }

  const draft = sentuh.filter((t) => t.status === "needs_review" && !t.induk_id && angka(t) > 0);
  tambah("draft_belum_dihitung", "Draft (Belum selesai / Tinggal dicek) di kantong ini: belum dihitung ke saldo sampai disimpan.", {
    jumlah: draft.length,
    total: draft.reduce((n, t) => n + pengaruh({ ...t, status: "confirmed" }, k.id), 0),
    contoh: draft.map((t) => ringkasTx(t, nama)),
  });

  const lewatRekening = terakhir ? sah.filter((t) => sesudah(t, terakhir.r.tanggal, terakhir.r.jam)) : [];
  return {
    kantong: k.name,
    jenis: k.kind,
    saldo_aplikasi_sekarang: m.saldoSekarang,
    rekening_koran_terakhir: terakhir
      ? {
          bank: namaBankRef(terakhir.r.bank),
          rentang: { dari: awal!.r.tanggal, sampai: terakhir.r.tanggal },
          tanggal_baris_terakhir: terakhir.r.tanggal,
          ...(terakhir.r.jam ? { jam_baris_terakhir: terakhir.r.jam } : {}),
          saldo_bank_di_baris_terakhir: terakhir.r.saldo,
          transaksi_sesudahnya: { jumlah: lewatRekening.length, pengaruh_ke_saldo: lewatRekening.reduce((n, t) => n + pengaruh(t, k.id), 0) },
        }
      : null,
    dibandingkan: saldoBank != null
      ? {
          saldo_bank: saldoBank,
          saldo_bank_dari: m.saldoBank != null ? "disebut pengguna" : "baris rekening koran",
          saldo_aplikasi_pada_titik_itu: saldoAplikasiTitik,
          titik: titik ? `${titik.tanggal}${titik.jam ? ` ${titik.jam}` : ""}` : "sekarang",
          selisih_aplikasi_dikurangi_bank: selisih,
          ...(saldoAplikasiTitik == null ? { catatan: `Saldo awal kantong ini berlaku sejak ${k.saldo_per}, sesudah titik itu: tidak bisa dibandingkan.` } : {}),
        }
      : { catatan: terakhir ? "Sebut tanggal/saldo bank untuk dibandingkan." : "Belum ada rekening koran yang diimpor untuk kantong ini; minta saldo bank dari pengguna untuk dibandingkan." },
    saldo_awal: { nominal: Number(k.saldo_awal), berlaku_sejak: k.saldo_per },
    calon_penyebab: penyebab,
  };
}

/**
 * cari_kejanggalan (SPEC-asisten-agen §2): daftar yang perlu dirapikan. `jenis`
 * membatasi ke satu jenis; tanpa jenis semuanya. Contoh paling banyak 10 per jenis.
 */
export const JENIS_KEJANGGALAN = ["perlu_dilengkapi", "draft", "dobel", "topup_tanpa_kantong", "pindah_lepas"] as const;
export type JenisKejanggalan = (typeof JENIS_KEJANGGALAN)[number];

export function cariKejanggalan(transaksi: TxPeriksa[], kantong: KantongPeriksa[], jenis: JenisKejanggalan | null) {
  const nama = (id: string | null) => kantong.find((x) => x.id === id)?.name ?? null;
  const mau = (j: JenisKejanggalan) => !jenis || jenis === j;
  const hasil: Record<string, unknown> = {};
  if (mau("perlu_dilengkapi")) {
    const isi = transaksi.filter((t) => tercatat(t) && t.perlu_dilengkapi);
    hasil.perlu_dilengkapi = { jumlah: isi.length, total: isi.reduce((n, t) => n + angka(t), 0), contoh: isi.slice(0, MAKS_CONTOH).map((t) => ringkasTx(t, nama)), cara: "Lengkapi dari gambar (screenshot/struk) atau ubah kategorinya." };
  }
  if (mau("draft")) {
    const isi = transaksi.filter((t) => t.status === "needs_review" && !t.induk_id).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    hasil.draft = { jumlah: isi.length, paling_lama: isi[0]?.transaction_date ?? null, contoh: isi.slice(0, MAKS_CONTOH).map((t) => ringkasTx(t, nama)), cara: "Buka Belum selesai di Beranda, lalu Simpan atau lengkapi." };
  }
  if (mau("dobel")) {
    const isi = cariDobel(transaksi);
    hasil.dobel = { jumlah_pasangan: isi.length, contoh: isi.slice(0, MAKS_CONTOH).map(([a, b]) => ({ pertama: ringkasTx(a, nama), kedua: ringkasTx(b, nama) })) };
  }
  if (mau("topup_tanpa_kantong")) {
    const isi = cariTopUpTanpaKantong(transaksi, kantong);
    hasil.topup_tanpa_kantong = isi.map(({ lembaga, isi }) => ({
      lembaga,
      jumlah: isi.length,
      total: isi.reduce((n, t) => n + angka(t), 0),
      contoh: isi.slice(0, MAKS_CONTOH).map((t) => ringkasTx(t, nama)),
      cara: `Buat kantong ${lembaga} di Profil → Kantong; aplikasi lalu menawarkan menjadikan top up ini pindah kantong.`,
    }));
  }
  if (mau("pindah_lepas")) {
    const uang = new Set(kantong.filter((x) => ["bank", "ewallet", "cash", "simpanan", "tujuan"].includes(x.kind)).map((x) => x.id));
    const isi = cariPindahLepas(transaksi, uang);
    hasil.pindah_lepas = { jumlah_pasangan: isi.length, contoh: isi.slice(0, MAKS_CONTOH).map(([a, b]) => ({ keluar: ringkasTx(a, nama), masuk: ringkasTx(b, nama) })) };
  }
  return hasil;
}

/**
 * Riwayat impor rekening koran (alat `cari` sumber `impor`). Tidak ada tabel
 * riwayat impor: diturunkan dari baris berpengenal rekening koran (ref_bank /
 * ref_bank_tujuan) per kantong & bulan — jumlah baris, rentang tanggal, bank,
 * saldo bank di baris terakhir bulan itu, yang perlu dilengkapi, dan kapan
 * terakhir diimpor (waktu simpan terbaru). Saldo aplikasi di akhir bulan itu
 * ada di periksa_saldo (titik `sampai`).
 */
export function riwayatImpor(transaksi: TxPeriksa[], kantong: Pick<KantongPeriksa, "id" | "name">[]) {
  const nama = (id: string | null) => kantong.find((x) => x.id === id)?.name ?? "(tanpa kantong)";
  const per = new Map<string, { kantong: string; bulan: string; bank: string | null; baris: { r: BarisRef | null; t: TxPeriksa; tanggal: string }[] }>();
  for (const t of transaksi) {
    if (!tercatat(t)) continue;
    for (const [id, ref] of [
      [t.kantong_id, t.ref_bank],
      [t.kantong_tujuan_id, t.ref_bank_tujuan],
    ] as const) {
      if (!ref || !id) continue;
      const r = bacaRef(ref);
      const tanggal = r?.tanggal ?? t.transaction_date;
      const kunci = `${id}|${tanggal.slice(0, 7)}`;
      const g = per.get(kunci) ?? per.set(kunci, { kantong: nama(id), bulan: tanggal.slice(0, 7), bank: null, baris: [] }).get(kunci)!;
      g.bank ??= namaBankRef(ref.split(":")[0]);
      g.baris.push({ r, t, tanggal });
    }
  }
  return [...per.values()]
    .sort((a, b) => b.bulan.localeCompare(a.bulan) || a.kantong.localeCompare(b.kantong))
    .map((g) => {
      const bersaldo = g.baris.filter((x) => x.r).sort((a, b) => a.r!.tanggal.localeCompare(b.r!.tanggal) || (a.r!.jam ?? "").localeCompare(b.r!.jam ?? "") || (a.t.created_at ?? "").localeCompare(b.t.created_at ?? ""));
      const tanggal = g.baris.map((x) => x.tanggal).sort();
      const diimpor = g.baris.map((x) => x.t.created_at ?? "").sort().at(-1);
      return {
        kantong: g.kantong,
        bank: g.bank,
        bulan: g.bulan,
        jumlah_baris: g.baris.length,
        dari: tanggal[0],
        sampai: tanggal.at(-1),
        saldo_bank_akhir: bersaldo.at(-1)?.r!.saldo ?? null,
        perlu_dilengkapi: g.baris.filter((x) => x.t.perlu_dilengkapi).length,
        ...(diimpor ? { terakhir_diimpor: diimpor.slice(0, 10) } : {}),
      };
    });
}

export type KelompokCari = "kantong" | "kategori" | "bulan" | "merchant" | "jenis" | "status" | "asal";
export type UrutCari = "terbaru" | "terlama" | "terbesar" | "terkecil";

const LABEL_STATUS = (t: TxPeriksa) => (t.status === "needs_review" ? "draft" : t.perlu_dilengkapi ? "perlu dilengkapi" : "tercatat");
const LABEL_ASAL: Record<string, string> = { statement: "rekening koran", text: "ketikan", receipt: "struk", payment_proof: "bukti bayar" };
const LABEL_JENIS: Record<string, string> = { expense: "keluar", income: "masuk", transfer: "pindah" };

/**
 * Hasil `cari` sumber transaksi (SPEC-asisten-agen §2): total (yang tercatat; draft
 * terpisah karena belum dihitung), kelompok & jumlahnya bila diminta, dan paling
 * banyak `batas` baris rinci (≤ 50) dengan id untuk `detail`; sisanya diringkas.
 */
export function ringkasPencarian(
  baris: TxPeriksa[],
  o: { kelompokkan: KelompokCari | null; urutkan: UrutCari; batas: number; namaKantong: (id: string | null) => string | null; namaKategori: (slug: string, type: string) => string },
) {
  const total = (isi: TxPeriksa[]) => {
    const sah = isi.filter(tercatat);
    const jumlah = (type: string) => sah.filter((t) => t.type === type).reduce((n, t) => n + angka(t), 0);
    return { total_keluar: jumlah("expense"), total_masuk: jumlah("income"), total_pindah: jumlah("transfer") };
  };
  const draft = baris.filter((t) => !tercatat(t));
  const kunci = (t: TxPeriksa): string => {
    switch (o.kelompokkan) {
      case "kantong":
        return o.namaKantong(t.kantong_id) ?? "(tanpa kantong)";
      case "kategori":
        return t.type === "transfer" ? "(pindah kantong)" : o.namaKategori(t.category ?? "other", t.type);
      case "bulan":
        return t.transaction_date.slice(0, 7);
      case "merchant":
        return (t.merchant ?? "").trim() || "(tanpa merchant)";
      case "jenis":
        return LABEL_JENIS[t.type] ?? t.type;
      case "status":
        return LABEL_STATUS(t);
      case "asal":
        return LABEL_ASAL[t.source ?? ""] ?? t.source ?? "(tidak diketahui)";
      default:
        return "";
    }
  };
  let kelompok: Record<string, unknown>[] | undefined;
  let kelompokLain: Record<string, unknown> | undefined;
  if (o.kelompokkan) {
    const per = new Map<string, TxPeriksa[]>();
    for (const t of baris) (per.get(kunci(t)) ?? per.set(kunci(t), []).get(kunci(t))!).push(t);
    const semua = [...per].map(([k, isi]) => {
      const tt = total(isi);
      return { kelompok: k, jumlah: isi.length, ...tt, _urut: tt.total_keluar + tt.total_masuk + tt.total_pindah };
    });
    semua.sort((a, b) => (o.kelompokkan === "bulan" ? b.kelompok.localeCompare(a.kelompok) : b._urut - a._urut));
    kelompok = semua.slice(0, MAKS_RINCI_KELOMPOK).map(({ _urut, ...x }) => (void _urut, x));
    const sisa = semua.slice(MAKS_RINCI_KELOMPOK);
    if (sisa.length) kelompokLain = { jumlah_kelompok: sisa.length, jumlah_transaksi: sisa.reduce((n, x) => n + x.jumlah, 0) };
  }
  const urut = [...baris].sort((a, b) => {
    if (o.urutkan === "terbesar") return angka(b) - angka(a);
    if (o.urutkan === "terkecil") return angka(a) - angka(b);
    const d = a.transaction_date.localeCompare(b.transaction_date) || (a.waktu ?? "").localeCompare(b.waktu ?? "") || (a.created_at ?? "").localeCompare(b.created_at ?? "");
    return o.urutkan === "terlama" ? d : -d;
  });
  const rinci = urut.slice(0, o.batas);
  const lain = urut.slice(o.batas);
  return {
    jumlah_transaksi: baris.length,
    ...total(baris),
    ...(draft.length ? { draft_belum_dihitung: { jumlah: draft.length, total: draft.reduce((n, t) => n + angka(t), 0) } } : {}),
    ...(kelompok ? { kelompok } : {}),
    ...(kelompokLain ? { kelompok_lain: kelompokLain } : {}),
    baris: rinci.map((t) => ({
      id: t.id,
      tanggal: t.transaction_date,
      ...(t.waktu ? { jam: t.waktu.slice(0, 5) } : {}),
      jenis: LABEL_JENIS[t.type] ?? t.type,
      nominal: angka(t),
      merchant: t.merchant ?? null,
      ...(t.description ? { keterangan: t.description.slice(0, 160) } : {}),
      ...(t.type !== "transfer" ? { kategori: o.namaKategori(t.category ?? "other", t.type) } : {}),
      kantong: o.namaKantong(t.kantong_id),
      ...(t.kantong_tujuan_id ? { ke_kantong: o.namaKantong(t.kantong_tujuan_id) } : {}),
      status: LABEL_STATUS(t),
      asal: LABEL_ASAL[t.source ?? ""] ?? t.source ?? null,
      ...(t.ref_bank || t.ref_bank_tujuan ? { ada_baris_rekening_koran: true } : {}),
      ...(t.induk_id ? { ikutan_dari: t.induk_id } : {}),
    })),
    ...(lain.length ? { baris_lain: { jumlah: lain.length, ...total(lain) } } : {}),
  };
}

const MAKS_RINCI_KELOMPOK = 50;
