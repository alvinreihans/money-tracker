import type { Rencana, RujukanKantong, TxBaru } from "@/lib/rekening/rencana";

/**
 * Rincian pratinjau impor rekening koran (docs/specs/SPEC-periksa-dulu.md §3):
 * daftar baris yang akan dibuat/ditautkan/diubah, per rekening, yang perlu
 * perhatian di atas. Tiap baris bisa dicentang/tidak lewat `refs` (pengenal
 * baris bank; pasangan pindah kantong dua sisi & biaya yang menempel ikut
 * bersama). Dihitung dari rencana TANPA pengecualian, supaya baris yang tidak
 * dicentang tetap tampil. Fungsi murni — diuji di scripts/uji-rekening.mts.
 */

export type TandaRincian = "pindah" | "kantongBaru" | "ingatan" | "ubahPindah" | "deposito" | "dobel" | "tautkan" | "biasa";

export interface BarisRincian {
  /** Pengenal baris di daftar (ref pertama). */
  kunci: string;
  /** Pengenal baris bank yang ikut dicentang/tidak bersama. Kosong = tidak bisa dicentang. */
  refs: string[];
  tanggal: string;
  judul: string;
  /** "Pindah ke DANA", "Kantong baru DANA", "Kategori dari bulan lalu", … */
  label: string | null;
  /** Bertanda dari sisi rekening ini: masuk +, keluar −. */
  nominal: number;
  tanda: TandaRincian;
  perhatian: boolean;
}

export interface RincianRekening {
  kunci: string;
  nama: string;
  baris: BarisRincian[];
}

/** Urutan yang perlu perhatian (spec §3). */
const URUT: TandaRincian[] = ["pindah", "kantongBaru", "ingatan", "ubahPindah", "deposito", "dobel", "tautkan", "biasa"];
const PERHATIAN = new Set<TandaRincian>(["pindah", "kantongBaru", "ingatan", "ubahPindah", "deposito", "dobel"]);

export function rincianImpor(r: Rencana): RincianRekening[] {
  const bank = new Map(r.barisBank.map((b) => [b.ref, b]));
  const rekDari = (ref: string) => bank.get(ref)?.kunciRek ?? (ref.includes(":bunga:") ? ref.split(":bunga:")[0] : null);
  const kantongRek = new Map(r.rekening.map((x) => [x.kunci, x.kantong]));
  const baru = new Map(r.kantongBaru.map((k) => [k.kunci, k.name]));
  const namaKantong = (id: RujukanKantong | null) => {
    if (!id) return null;
    if (baru.has(id)) return baru.get(id)!;
    return r.rekening.find((x) => x.kantong === id)?.namaKantong ?? null;
  };
  const ingat = new Set(r.dariIngatan);
  const depo = new Set(r.refDeposito);
  const dipakai = new Set<string>();
  const hasil = new Map<string, BarisRincian[]>(r.rekening.map((x) => [x.kunci, []]));
  // Baris yang sudah ada di database (impor sebelumnya) bukan bagian rincian.
  // Baris deposito jatuh tempo tampil terpisah (langkah 4) dan tidak bisa dikecualikan.
  const bisa = (ref: string | null | undefined): ref is string => Boolean(ref) && !dipakai.has(ref!) && !depo.has(ref!) && (bank.has(ref!) || ref!.includes(":bunga:"));
  const tambah = (rek: string | null, b: Omit<BarisRincian, "kunci" | "perhatian">) => {
    if (!rek || !hasil.has(rek)) return;
    b.refs.forEach((x) => dipakai.add(x));
    hasil.get(rek)!.push({ ...b, kunci: b.refs[0] ?? `${b.tanggal}:${b.judul}`, perhatian: PERHATIAN.has(b.tanda) });
  };

  // 1. Dugaan dobel dengan transaksi yang sudah ada.
  for (const g of r.ragu) {
    const b = bank.get(g.ref);
    if (!b) continue;
    tambah(b.kunciRek, { refs: [g.ref], tanggal: g.tanggal, judul: g.uraian || "Baris bank", label: "Mungkin sudah tercatat", nominal: g.nominal, tanda: "dobel" });
  }

  // 2. Transaksi baru; biaya yang menempel ikut induknya.
  const ikutan = new Map<string, TxBaru[]>();
  for (const t of r.sisip) if (t.induk) ikutan.set(t.induk, [...(ikutan.get(t.induk) ?? []), t]);
  for (const t of r.sisip) {
    if (t.induk) continue;
    const refs = [t.ref_bank, t.ref_bank_tujuan, ...(ikutan.get(t.kunci) ?? []).map((x) => x.ref_bank)].filter(bisa);
    const utama = refs[0];
    if (!utama) continue;
    const rek = rekDari(utama);
    const milik = rek ? kantongRek.get(rek) : null;
    let tanda: TandaRincian = "biasa";
    let label: string | null = t.perlu_dilengkapi ? "Perlu dilengkapi" : null;
    let nominal = t.type === "income" ? t.amount : -t.amount;
    if (t.type === "transfer") {
      const keluar = t.kantong_id === milik;
      nominal = keluar ? -t.amount : t.amount;
      const lawan = keluar ? t.kantong_tujuan_id : t.kantong_id;
      const nama = namaKantong(lawan) ?? t.merchant ?? "kantong lain";
      if (lawan && baru.has(lawan)) {
        tanda = "kantongBaru";
        label = `Kantong baru ${nama}`;
      } else {
        tanda = "pindah";
        label = keluar ? `Pindah ke ${nama}` : `Pindah dari ${nama}`;
      }
    } else if (ingat.has(t.kunci)) {
      tanda = "ingatan";
      label = "Kategori dari bulan lalu";
    } else if (t.cicilan_id) label = t.description;
    tambah(rek, { refs, tanggal: t.transaction_date, judul: t.merchant ?? t.description ?? "Transaksi", label, nominal, tanda });
  }

  // 3. Transaksi di kantong lain yang diubah jadi pindah kantong (R2).
  for (const u of r.ubahPindah) {
    const refs = [u.ref_bank, u.ref_bank_tujuan].filter(bisa);
    const b = refs.length ? bank.get(refs[0]) : null;
    if (!b) continue;
    tambah(b.kunciRek, { refs, tanggal: b.tanggal, judul: u.merchant, label: "Diubah jadi pindah kantong", nominal: b.nominal, tanda: "ubahPindah" });
  }

  // 4. Deposito jatuh tempo: ditampilkan, tidak bisa dikecualikan satu per satu.
  for (const ref of r.refDeposito) {
    const b = bank.get(ref);
    if (!b || dipakai.has(ref)) continue;
    dipakai.add(ref);
    hasil.get(b.kunciRek)?.push({ kunci: ref, refs: [], tanggal: b.tanggal, judul: b.uraian || "Deposito", label: "Deposito jatuh tempo", nominal: b.nominal, tanda: "deposito", perhatian: true });
  }

  // 5. Baris yang ditautkan ke transaksi yang sudah tercatat.
  for (const x of r.tautkan) {
    const refs = [x.ref_bank, x.ref_bank_tujuan].filter(bisa);
    const b = refs.length ? bank.get(refs[0]) : null;
    if (!b) continue;
    tambah(b.kunciRek, { refs, tanggal: b.tanggal, judul: b.uraian || "Baris bank", label: "Sudah tercatat, ditautkan", nominal: b.nominal, tanda: "tautkan" });
  }

  return r.rekening
    .map((x) => ({
      kunci: x.kunci,
      nama: x.nama,
      baris: (hasil.get(x.kunci) ?? []).sort((a, b) => URUT.indexOf(a.tanda) - URUT.indexOf(b.tanda) || a.tanggal.localeCompare(b.tanggal)),
    }))
    .filter((x) => x.baris.length);
}

/**
 * Pengenal yang dikecualikan sesudah satu baris dicentang/tidak: semua `refs`
 * baris itu ikut (pasangan pindah kantong dua sisi dicentang bersama).
 */
export function ubahKecuali(kecuali: string[], refs: string[], centang: boolean): string[] {
  const sisa = kecuali.filter((x) => !refs.includes(x));
  return centang ? sisa : [...sisa, ...refs];
}
