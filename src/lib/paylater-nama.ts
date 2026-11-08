/**
 * Pembaku nama paylater (SPEC-kantong-sendiri D-1): satu ejaan per penyedia,
 * dipakai ekstraksi AI (`paylater.penyedia`), `pilihCicilan`, dan impor
 * rekening koran (`kantongPaylater`, cicilan). Fungsi murni — diuji di
 * scripts/uji-pindah.mts.
 */

/** Penyedia yang dikenali dari teks bebas ("Pembayaran SPayLater", "SPinjam"). SPinjam sebelum Shopee PayLater. */
const POLA: [RegExp, string][] = [
  [/\bs\s*pinjam\b|shopee\s*pinjam/i, "SPinjam"],
  [/\bs\s*pay\s*later\b|shopee\s*pay\s*later/i, "Shopee PayLater"],
  [/\bgo\s*pay\s*later\b|gojek\s*pay\s*later/i, "GoPayLater"],
  [/\btraveloka\s*pay\s*later\b/i, "Traveloka PayLater"],
  [/\bkredivo\b/i, "Kredivo"],
  [/\bakulaku\b/i, "Akulaku"],
  [/\batome\b/i, "Atome"],
  [/\bindodana\b/i, "Indodana"],
];

/** Penyedia paylater yang disebut teks, dibakukan; null bila tidak ada (untuk mengenali baris rekening koran). */
export function penyediaPaylater(teks: string | null | undefined): string | null {
  if (!teks) return null;
  return POLA.find(([p]) => p.test(teks))?.[1] ?? null;
}

/**
 * Sebutan paylater → nama baku ("SPayLater" → "Shopee PayLater"). `longgar`:
 * sebutan yang pasti paylater (isian `paylater.penyedia` dari AI) — "Shopee" /
 * "ShopeePay" saja juga dianggap Shopee PayLater, "GoPay"/"Gojek" GoPayLater.
 * Selain itu sebutan apa adanya (dirapikan).
 */
export function bakukanPaylater(sebutan: string, longgar = false): string {
  const t = sebutan.trim();
  const baku = penyediaPaylater(t);
  if (baku) return baku;
  if (longgar) {
    if (/shopee|spay/i.test(t)) return "Shopee PayLater";
    if (/gopay|gojek/i.test(t)) return "GoPayLater";
  }
  return t.slice(0, 40);
}
