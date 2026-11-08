import type { JenisKantong } from "@/lib/kantong";
import { penyediaPaylater } from "@/lib/paylater-nama";

/**
 * Nama bank & e-wallet yang dikenal (SPEC-kantong-sendiri A-1/A-2): teks dari
 * bank/gambar ("BANK JAGO", "Top Up DANA", "Shopee") → nama baku kantongnya,
 * dan tebakan jenis kantong dari nama. Pengetahuan umum, bukan data user.
 * Fungsi murni — diuji di scripts/uji-pindah.mts.
 */

/** [pola, nama baku]. Urutan penting: "Jenius Pay" sebelum Jenius, "blu by BCA Digital" sebelum BCA, paylater tidak di sini. */
const EWALLET: [RegExp, string][] = [
  [/\bdana\b/i, "DANA"],
  [/\bgo\s*-?\s*pay\b(?!\s*later)|\bgojek\b/i, "GoPay"],
  [/\bovo\b/i, "OVO"],
  [/shopee\s*pay(?!\s*later)|^\s*shopee\s*$|\bspay\b(?!\s*later)/i, "ShopeePay"],
  [/link\s*aja/i, "LinkAja"],
  [/\bflip\b/i, "Flip"],
  [/jenius\s*pay/i, "Jenius Pay"],
  [/\bi\.?\s?saku\b/i, "i.saku"],
  [/\bsakuku\b/i, "Sakuku"],
  [/\bdoku\b/i, "DOKU"],
  [/astra\s*pay/i, "AstraPay"],
];
const BANK: [RegExp, string][] = [
  [/\bblu\b|bca\s*digital/i, "blu"],
  [/\bbri\b|bank rakyat|\bbrimo\b/i, "BRI"],
  [/\bbca\b|central asia/i, "BCA"],
  [/\bbni\b|negara indonesia|\bwondr\b/i, "BNI"],
  [/\bmandiri\b|\blivin\b/i, "Mandiri"],
  [/\bbsi\b|syariah indonesia/i, "BSI"],
  [/\bbtn\b/i, "BTN"],
  [/\bcimb\b|\bocto\b/i, "CIMB Niaga"],
  [/\bpermata/i, "Permata"],
  [/\bdanamon\b/i, "Danamon"],
  [/\bjago\b/i, "Jago"],
  [/\bsea\s*bank\b/i, "SeaBank"],
  [/\bjenius\b|\bbtpn\b/i, "Jenius"],
  [/neo\s*commerce|\bbank neo\b/i, "Neo"],
  [/\ballo\s*bank\b/i, "Allo"],
  [/\bsuper\s*bank\b/i, "Superbank"],
  [/\bocbc\b/i, "OCBC"],
  [/\bmaybank\b/i, "Maybank"],
  [/\bpanin\b/i, "Panin"],
  [/\buob\b/i, "UOB"],
  [/\bbjb\b/i, "BJB"],
  [/\bbank mega\b/i, "Mega"],
];

/** E-wallet yang dikenal dari teks, atau null. */
export const namaEwallet = (teks: string | null | undefined) => (teks ? (EWALLET.find(([p]) => p.test(teks))?.[1] ?? null) : null);
/** Bank yang dikenal dari teks, atau null. */
export const namaBankDikenal = (teks: string | null | undefined) => (teks ? (BANK.find(([p]) => p.test(teks))?.[1] ?? null) : null);

/** Bank/e-wallet yang dikenal dari teks ("BANK JAGO" → "Jago", "Dana" → "DANA"); paylater tidak termasuk. Null bila tidak dikenal. */
export function namaLembaga(teks: string | null | undefined): string | null {
  if (!teks || penyediaPaylater(teks)) return null;
  return namaEwallet(teks) ?? namaBankDikenal(teks);
}

/**
 * Jenis kantong dari namanya (A-1): paylater → kredit (kantong utang, K3),
 * e-wallet → ewallet, "tunai"/"cash" → cash, selain itu bank. Bisa diubah di Profil.
 */
export function tebakJenisKantong(nama: string): Extract<JenisKantong, "bank" | "ewallet" | "cash" | "kredit"> {
  if (penyediaPaylater(nama)) return "kredit";
  if (namaEwallet(nama)) return "ewallet";
  if (/\b(tunai|cash|uang tunai|dompet)\b/i.test(nama)) return "cash";
  return "bank";
}

/** Emoji bawaan kantong yang dibuat di tempat. */
export const emojiJenis = (kind: string) => (kind === "ewallet" ? "📱" : kind === "cash" ? "💵" : kind === "kredit" ? "💳" : "🏦");
