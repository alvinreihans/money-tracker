import type { UserAccount } from "@/types/transaction";

/**
 * Nama lain yang dipakai bank/dompet di rekening koran dan aplikasinya.
 *
 * Ini pengetahuan umum, bukan data milik user — jadi tempatnya di kode, bukan
 * di database. Versi sebelumnya meminta user mengisinya sendiri lewat UI, yang
 * keliru dua kali: user tidak bisa tahu rekening koran BRI menulis dirinya
 * "BRImo" sebelum pernah membukanya, dan tabel ini toh sama untuk semua orang.
 *
 * Dipakai hanya untuk pencocokan string deterministik (deteksi rekening dari
 * header PDF, dan pengenalan jalur e-wallet saat dedup). Untuk penalaran di
 * prompt, LLM sudah mengenali variasi nama ini tanpa perlu diberi daftar.
 */
const KNOWN_ALIASES: Record<string, string[]> = {
  // --- Bank ---
  bri: ["BRImo", "BRI Mobile", "Bank BRI", "Bank Rakyat Indonesia"],
  bca: ["myBCA", "BCA Mobile", "KlikBCA", "Bank Central Asia"],
  mandiri: ["Livin", "Livin by Mandiri", "Bank Mandiri"],
  bni: ["Wondr", "BNI Mobile", "Bank Negara Indonesia"],
  bsi: ["BSI Mobile", "Bank Syariah Indonesia", "Byond"],
  btn: ["Bank BTN", "Bale"],
  cimb: ["OCTO", "OCTO Mobile", "CIMB Niaga"],
  permata: ["PermataMobile", "PermataBank"],
  danamon: ["D-Bank", "Bank Danamon"],
  jago: ["Bank Jago"],
  seabank: ["Sea Bank", "SeaBank Indonesia"],
  jenius: ["BTPN", "Bank BTPN"],
  blu: ["blu by BCA Digital", "BCA Digital"],
  neo: ["Bank Neo Commerce", "Neobank"],
  allo: ["Allo Bank"],
  superbank: ["Super Bank"],

  // --- E-wallet ---
  shopeepay: ["Shopee", "SPay", "Shopee Pay"],
  gopay: ["Gojek", "Go-Pay", "Go Pay"],
  ovo: [],
  dana: [],
  linkaja: ["Link Aja", "LinkAja!"],
  tunai: ["Cash", "COD"],
};

/** Semua nama yang mungkin merujuk ke rekening ini, termasuk namanya sendiri. */
export function accountNames(account: UserAccount): string[] {
  const kunci = account.name.toLowerCase().replace(/\s+/g, "");
  const bawaan = KNOWN_ALIASES[kunci] ?? [];
  // `aliases` dari database dipertahankan agar data lama tetap terpakai,
  // walaupun UI tidak lagi memintanya.
  return [account.name, ...bawaan, ...(account.aliases ?? [])];
}

/** Semua nama dompet elektronik milik user; dipakai saat mendeteksi dedup. */
export function walletNames(accounts: UserAccount[]): string[] {
  return accounts
    .filter((a) => a.kind === "ewallet")
    .flatMap((a) => accountNames(a));
}
