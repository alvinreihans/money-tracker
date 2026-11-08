import { kantongBank, namaSama } from "@/lib/arah";
import { pihakBri } from "@/lib/rekening/bri";
import { samaPemilik } from "@/lib/rekening/rencana";
import { empatAkhir, selisihHari } from "@/lib/rekening/teks";

export { emojiJenis, namaLembaga, tebakJenisKantong } from "@/lib/lembaga";

/**
 * Penautan ulang saat kantong dibuat (SPEC-kantong-sendiri A-3): pengeluaran/
 * pemasukan dari rekening koran (K4) yang tampaknya pindah ke/dari kantong
 * baru itu → calon "Jadikan pindah kantong?". Fungsi murni — diuji di
 * scripts/uji-pindah.mts; datanya dimuat src/lib/pindah-server.ts dan
 * diterapkan lewat RPC jadikan_pindah.
 */

export interface KantongPindah {
  id: string;
  name: string;
  kind: string;
  aliases?: string[] | null;
  nomor_akhir?: string | null;
}

/** Transaksi yang ditimbang (kolom view transactions yang dipakai). */
export interface TransaksiPindah {
  id: string;
  amount: number | string;
  type: string;
  status?: string | null;
  source?: string | null;
  merchant?: string | null;
  description?: string | null;
  kantong_id: string | null;
  kantong_tujuan_id: string | null;
  transaction_date: string;
  waktu?: string | null;
  updated_at: string;
  ref_bank_tujuan?: string | null;
  induk_id?: string | null;
  cicilan_id?: string | null;
  pecahan_dari?: string | null;
}

export interface KonteksPindah {
  /** Nama user di rekening/dompetnya (user_metadata.nama_rekening, diisi impor rekening koran — B-1). */
  namaUser: string[];
}

export interface CalonPindah {
  id: string;
  /** "ke": pengeluaran dari kantong lain ke kantong baru; "dari": pemasukan dari kantong baru. */
  arah: "ke" | "dari";
  type: "expense" | "income";
  amount: number;
  transaction_date: string;
  waktu: string | null;
  merchant: string | null;
  /** Kantong asal transaksinya (sisi lain dari kantong baru). */
  kantong_id: string;
  updated_at: string;
  /** Tanda rekening sendiri yang dikenali. */
  tanda: "nama" | "nomor";
  /** Sisi lawan yang sudah tercatat di kantong baru: digabung (dihapus) saat dijadikan pindah. */
  gabung: { id: string; updated_at: string; merchant: string | null } | null;
}

/** Pihak lawan yang terbaca dari merchant & keterangan transaksi rekening koran. */
export interface PihakTeks {
  /** Calon nama bank/e-wallet lawan. */
  bank: string[];
  /** Calon nama orang lawan (pemilik). */
  nama: string[];
  /** 4 digit akhir nomor rekening lawan yang tertulis. */
  nomor: string[];
}

const NOMOR = /(?:…|\.{3}|\s)(\d{4,})\s*$/;

/**
 * Pihak dari teks yang tersimpan: BRI (uraian utuh di keterangan: "Top Up DANA … via BRImo",
 * "Transfer BI-Fast ke BANK X - 123… - Nama"), SeaBank/Jago ("NAMA · Bank …1234 · …").
 */
export function pihakDariTeks(merchant: string | null | undefined, description: string | null | undefined): PihakTeks {
  const hasil: PihakTeks = { bank: [], nama: [], nomor: [] };
  const desc = (description ?? "").trim();
  const bri = desc ? pihakBri(desc) : null;
  if (bri?.bank) {
    hasil.bank.push(bri.bank);
    if (bri.nama) hasil.nama.push(bri.nama);
    const akhir = empatAkhir(bri.nomor);
    if (akhir && /^\d+$/.test(bri.nomor ?? "")) hasil.nomor.push(akhir);
    // "Top Up DANA 0812xxxx345 BUDX SAXXXXX via BRImo": nama tersamar sesudah nomornya.
    if (/^Top Up/i.test(desc)) hasil.nama.push(desc.replace(/^Top Up \S+ \S+ /i, "").replace(/ via BRImo.*$/i, ""));
  }
  for (const bagian of desc.split(" · ")) {
    const t = bagian.trim();
    if (!t) continue;
    const m = t.match(NOMOR);
    if (m) {
      hasil.nomor.push(m[1].slice(-4));
      hasil.bank.push(t.slice(0, m.index).replace(/[\s….]+$/, ""));
    } else hasil.bank.push(t);
  }
  if (merchant) {
    hasil.nama.push(merchant);
    hasil.bank.push(merchant);
  }
  const unik = (a: string[]) => [...new Set(a.map((x) => x.trim()).filter(Boolean))];
  return { bank: unik(hasil.bank), nama: unik(hasil.nama), nomor: unik(hasil.nomor) };
}

/** Nama ini nama user (boleh tersamar "BUDX SAXXXXX" / "REI***"). */
export const namaUserSama = (nama: string, namaUser: string[]) => namaUser.some((n) => samaPemilik(nama, n) || namaSama(n, nama));

const menit = (j: string | null | undefined) => (j ? Number(j.slice(0, 2)) * 60 + Number(j.slice(3, 5)) : null);

/**
 * Calon pindah kantong untuk `kantongBaru` (A-3):
 * - hanya pengeluaran/pemasukan rekening koran (K4) di kantong lain yang belum jadi
 *   pindah kantong (bukan ikutan, cicilan, pecahan);
 * - nama bank/e-wallet lawan cocok dengan nama kantong (kantongBank: nama & alias), **dan**
 * - ada tanda rekening sendiri: nama pemilik (boleh tersamar) atau 4 digit akhir = nomor_akhir kantong.
 * Sisi lawan yang sudah tercatat di kantong baru (pemasukan untuk pengeluaran & sebaliknya,
 * sumber apa pun) digabung: nominal sama, ±1 hari, menit sama bila keduanya berjam (§6).
 */
export function cariCalonPindah(kantongBaru: KantongPindah, transaksi: TransaksiPindah[], konteks: KonteksPindah): CalonPindah[] {
  const bebas = (t: TransaksiPindah) =>
    (t.status ?? "confirmed") === "confirmed" && !t.kantong_tujuan_id && !t.ref_bank_tujuan && !t.induk_id && !t.cicilan_id && !t.pecahan_dari && (t.type === "expense" || t.type === "income");
  const calon: CalonPindah[] = [];
  for (const t of transaksi) {
    if (t.source !== "statement" || !bebas(t) || !t.kantong_id || t.kantong_id === kantongBaru.id) continue;
    const p = pihakDariTeks(t.merchant, t.description);
    if (!p.bank.some((b) => kantongBank(b, [kantongBaru]))) continue;
    const nomor = Boolean(kantongBaru.nomor_akhir) && p.nomor.includes(kantongBaru.nomor_akhir!);
    const nama = p.nama.some((n) => namaUserSama(n, konteks.namaUser));
    if (!nomor && !nama) continue;
    calon.push({
      id: t.id,
      arah: t.type === "expense" ? "ke" : "dari",
      type: t.type as "expense" | "income",
      amount: Number(t.amount),
      transaction_date: t.transaction_date,
      waktu: t.waktu ?? null,
      merchant: t.merchant ?? null,
      kantong_id: t.kantong_id,
      updated_at: t.updated_at,
      tanda: nomor ? "nomor" : "nama",
      gabung: null,
    });
  }
  // Sisi lawan di kantong baru: tanggal terdekat dulu, satu transaksi untuk satu calon.
  const terpakai = new Set<string>();
  const lawan = transaksi.filter((t) => t.kantong_id === kantongBaru.id && bebas(t));
  for (const c of calon.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || (a.waktu ?? "").localeCompare(b.waktu ?? ""))) {
    const g = lawan
      .filter(
        (t) =>
          !terpakai.has(t.id) &&
          t.type === (c.type === "expense" ? "income" : "expense") &&
          Math.abs(Number(t.amount) - c.amount) < 0.005 &&
          Math.abs(selisihHari(t.transaction_date, c.transaction_date)) <= 1 &&
          (!c.waktu || !t.waktu || menit(c.waktu) === menit(t.waktu)),
      )
      .sort((x, y) => Math.abs(selisihHari(x.transaction_date, c.transaction_date)) - Math.abs(selisihHari(y.transaction_date, c.transaction_date)))[0];
    if (g) {
      terpakai.add(g.id);
      c.gabung = { id: g.id, updated_at: g.updated_at, merchant: g.merchant ?? null };
    }
  }
  return calon;
}

/** Isian RPC jadikan_pindah untuk calon-calon itu. */
export function isianJadikanPindah(kantongBaru: Pick<KantongPindah, "id" | "name">, calon: CalonPindah[]) {
  return {
    ubah: calon.map((c) => ({
      id: c.id,
      updated_at: c.updated_at,
      kantong_lawan: kantongBaru.id,
      merchant: `${c.arah === "ke" ? "Pindah ke" : "Pindah dari"} ${kantongBaru.name}`,
      gabung: c.gabung ? { id: c.gabung.id, updated_at: c.gabung.updated_at } : null,
    })),
  };
}

/** "3 transaksi lama sepertinya pindah ke DANA. Jadikan pindah kantong?" */
export function kalimatCalonPindah(nama: string, calon: CalonPindah[]): string {
  const ke = calon.filter((c) => c.arah === "ke").length;
  const arah = ke === calon.length ? `pindah ke ${nama}` : ke === 0 ? `pindah dari ${nama}` : `pindah ke/dari ${nama}`;
  return `${calon.length} transaksi lama sepertinya ${arah}. Jadikan pindah kantong?`;
}
