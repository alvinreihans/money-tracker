/**
 * Jam transaksi & saldo per jam (SPEC-saldo-waktu.md). Fungsi murni — diuji di
 * scripts/uji-waktu.mts. Semua jam dalam WIB, format "HH:MM".
 */

const ZONA = "Asia/Jakarta";

/** "HH:MM" menurut WIB — server berjalan di UTC. */
export const jamWIB = (waktu: Date | string) =>
  new Date(waktu).toLocaleTimeString("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });

/** Perkiraan jam untuk bagian hari yang disebut ("tadi pagi"). */
export const PERKIRAAN = { pagi: "08:00", siang: "12:00", sore: "16:00", malam: "20:00" } as const;
export type BagianHari = keyof typeof PERKIRAAN;
/** Dari AI: bagian hari, atau "lampau" (sudah terjadi, tanpa petunjuk jam). */
export type PetunjukJam = BagianHari | "lampau";

/**
 * Rentang tiap bagian hari. Perkiraan hanya ditanyakan kalau jam saldo jatuh
 * di dalam rentangnya ("tadi siang" vs saldo 14.00 → bisa sebelum/sesudah);
 * kalau tidak, seluruh rentangnya jelas sebelum atau sesudah saldo.
 */
const RENTANG: Record<BagianHari, [string, string]> = {
  pagi: ["05:00", "11:00"],
  siang: ["11:00", "15:00"],
  sore: ["15:00", "18:00"],
  malam: ["18:00", "24:00"],
};

const menit = (jam: string) => {
  const [h, m] = jam.split(":").map(Number);
  return h * 60 + m;
};
const duaDigit = (n: number) => String(n).padStart(2, "0");
const jamSah = (h: number, m: number) => Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;

/**
 * Jam dari jawaban ketik "Tadi itu jam berapa?": "jam 10", "10.30", "10:30",
 * "jam 2 siang", "barusan", "pagi". `perkiraan` = hanya bagian hari.
 */
export function bacaJam(teks: string, sekarang = new Date()): { jam: string; perkiraan: boolean } | null {
  const t = teks.toLowerCase().trim();
  if (!t) return null;
  if (/\b(barusan|baru aja|baru saja|sekarang|just now)\b/.test(t)) return { jam: jamWIB(sekarang), perkiraan: false };
  const bagian = (Object.keys(PERKIRAAN) as BagianHari[]).find((b) => new RegExp(`\\b${b}\\b`).test(t));

  const m = t.match(/(?:jam|pukul|pkl\.?)?\s*(\d{1,2})(?:[.:](\d{2}))?/);
  if (m && (m[2] !== undefined || /\b(jam|pukul|pkl)\b/.test(t) || /^\d{1,2}$/.test(t) || bagian)) {
    let h = Number(m[1]);
    const mm = m[2] !== undefined ? Number(m[2]) : 0;
    // "jam 2 siang" = 14.00, "jam 7 malam" = 19.00; "jam 12 malam" = 00.00.
    if ((bagian === "siang" && h >= 1 && h <= 5) || ((bagian === "sore" || bagian === "malam") && h >= 1 && h <= 11)) h += 12;
    if (bagian === "malam" && h === 12) h = 0;
    if (jamSah(h, mm)) return { jam: `${duaDigit(h)}:${duaDigit(mm)}`, perkiraan: false };
  }
  if (bagian) return { jam: PERKIRAAN[bagian], perkiraan: true };
  return null;
}

/**
 * Jam yang disimpan untuk transaksi baru dari AI (struk/bukti/ketik).
 * - jam tertera/disebut → itu;
 * - bagian hari → perkiraannya (`perkiraan`);
 * - "tadi" tanpa petunjuk → belum diketahui (null);
 * - tanpa petunjuk sama sekali, bertanggal hari ini → jam saat dicatat
 *   (orang biasanya mencatat begitu belanja); hari lain → null.
 */
export function jamTransaksi(
  { time, hint }: { time: string | null | undefined; hint: PetunjukJam | null | undefined },
  tanggal: string,
  sekarang = new Date(),
): { waktu: string | null; perkiraan: boolean } {
  if (time) return { waktu: time, perkiraan: false };
  if (hint && hint !== "lampau") return { waktu: PERKIRAAN[hint], perkiraan: true };
  if (hint === "lampau") return { waktu: null, perkiraan: false };
  const hariIni = new Date(sekarang).toLocaleDateString("en-CA", { timeZone: ZONA });
  return { waktu: tanggal === hariIni ? jamWIB(sekarang) : null, perkiraan: false };
}

/** Saldo sebuah kantong: tanggal & jam WIB mulai berlakunya. */
export interface SaldoSejak {
  tanggal: string;
  jam: string;
}

export const saldoSejak = (k: { saldo_per: string; saldo_sejak?: string | null }): SaldoSejak => ({
  tanggal: k.saldo_per,
  jam: k.saldo_sejak ? jamWIB(k.saldo_sejak) : "00:00",
});

/**
 * Perlu ditanya "Tadi itu jam berapa?" — hanya di hari saldo kantongnya, saat
 * jamnya belum diketahui, atau hanya perkiraan bagian hari yang rentangnya
 * mencakup jam saldo.
 */
export function perluTanyaJam(
  tx: { transaction_date: string; waktu: string | null; perkiraan?: boolean },
  saldo: SaldoSejak | undefined,
): boolean {
  if (!saldo || tx.transaction_date !== saldo.tanggal) return false;
  if (!tx.waktu) return true;
  if (!tx.perkiraan) return false;
  const bagian = (Object.keys(PERKIRAAN) as BagianHari[]).find((b) => PERKIRAAN[b] === tx.waktu?.slice(0, 5));
  if (!bagian) return false;
  const [awal, akhir] = RENTANG[bagian];
  return menit(saldo.jam) >= menit(awal) && menit(saldo.jam) < menit(akhir);
}

/**
 * Transaksi ikut menggeser saldo kantong? Aturannya sama dengan RPC
 * saldo_kantong(): sesudah hari saldo, atau di hari saldo pada/sesudah jamnya;
 * tanpa jam di hari saldo = dianggap sesudah.
 */
export function ikutSaldo(tx: { transaction_date: string; waktu?: string | null }, saldo: SaldoSejak): boolean {
  if (tx.transaction_date !== saldo.tanggal) return tx.transaction_date > saldo.tanggal;
  return !tx.waktu || menit(tx.waktu.slice(0, 5)) >= menit(saldo.jam);
}

/** Saldo berlaku sejak: hari ini → sekarang; tanggal lain → 00.00 WIB tanggal itu. */
export function saldoSejakDari(tanggal: string, sekarang = new Date()): string {
  const hariIni = sekarang.toLocaleDateString("en-CA", { timeZone: ZONA });
  return tanggal === hariIni ? sekarang.toISOString() : `${tanggal}T00:00:00+07:00`;
}

/** "10:30:00" / "10:30" → "10.30" untuk tampilan. */
export const fmtJam = (waktu: string | null | undefined) => (waktu ? waktu.slice(0, 5).replace(":", ".") : null);
