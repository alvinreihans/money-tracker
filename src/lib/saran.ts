/**
 * Saran di kolom "Catat": transaksi yang baru dicatat, ditulis ulang sebagai
 * teks yang sama seperti yang diketik user ("Warteg Bahari 20rb Tunai").
 * Pembelian harian sering berulang, jadi satu ketukan mengisi kolomnya.
 *
 * Mengikuti pola pencarian One UI: saran ditampilkan sebelum mengetik,
 * "help users find what they need without typing".
 */

/** 20000 -> "20rb", 2000000 -> "2jt"; selain bilangan bulat ribuan, apa adanya. */
export function nominalRingkas(n: number): string {
  if (n >= 1_000_000 && n % 1_000_000 === 0) return `${n / 1_000_000}jt`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}rb`;
  return String(n);
}

export interface BarisSaran {
  merchant: string | null;
  amount: number | string;
  payment_method: string | null;
}

/** Baris harus sudah terurut dari yang terbaru. Duplikat (beda huruf besar-kecil) dibuang. */
export function saranCatat(baris: BarisSaran[], maks = 5): string[] {
  const hasil: string[] = [];
  const sudah = new Set<string>();

  for (const b of baris) {
    const merchant = b.merchant?.trim();
    const nominal = Number(b.amount);
    if (!merchant || !(nominal > 0)) continue;

    const teks = [merchant, nominalRingkas(nominal), b.payment_method?.trim()].filter(Boolean).join(" ");
    const kunci = teks.toLowerCase();
    if (sudah.has(kunci)) continue;

    sudah.add(kunci);
    hasil.push(teks);
    if (hasil.length === maks) break;
  }

  return hasil;
}
