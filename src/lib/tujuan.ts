/**
 * Tujuan tabungan (SPEC-tujuan-tabungan): kantong berjenis "tujuan" dengan
 * target & tenggat. Saldonya = yang sudah terkumpul. Fungsi murni — diuji di
 * scripts/uji-metode.mts.
 */

export const EMOJI_TUJUAN = "🎯";

export const kantongTujuan = (k: { kind: string }) => k.kind === "tujuan";

export interface ProgresTujuan {
  terkumpul: number;
  sisa: number;
  /** Terkumpul ÷ target × 100, dibulatkan, maks 100. */
  persen: number;
  tercapai: boolean;
  /** Perlu disisihkan per bulan agar tercapai di bulan tenggat (bulan ini ikut dihitung). */
  perBulan: number | null;
  /** Tenggat sudah lewat dan belum tercapai. */
  telat: boolean;
}

/** `hariIni` dan `tenggat`: "YYYY-MM-DD". */
export function progresTujuan(t: { target?: number | string | null; tenggat?: string | null; saldo: number }, hariIni: string): ProgresTujuan {
  const target = Number(t.target ?? 0);
  const terkumpul = Math.max(0, t.saldo);
  const sisa = Math.max(0, target - terkumpul);
  const tercapai = target > 0 && sisa === 0;
  const persen = target > 0 ? Math.min(100, Math.round((terkumpul / target) * 100)) : 0;
  if (!t.tenggat || tercapai) return { terkumpul, sisa, persen, tercapai, perBulan: null, telat: false };
  const telat = t.tenggat < hariIni;
  const [ti, bi] = hariIni.split("-").map(Number);
  const [tt, bt] = t.tenggat.split("-").map(Number);
  const bulan = (tt - ti) * 12 + (bt - bi) + 1;
  return { terkumpul, sisa, persen, tercapai, perBulan: telat ? null : Math.ceil(sisa / Math.max(1, bulan)), telat };
}
