import { extractText, getDocumentProxy } from "unpdf";

/**
 * Ekstraksi teks dari PDF rekening koran.
 *
 * Rekening koran bank Indonesia umumnya PDF ber-teks asli, bukan hasil scan —
 * jadi tidak perlu OCR sama sekali. Ini jauh lebih akurat daripada jalur gambar:
 * nominal terbaca persis, tanpa risiko 3 terbaca 8.
 */

export interface PdfText {
  totalPages: number;
  /** Teks per halaman. Sengaja tidak digabung: lihat catatan di statement.ts. */
  pages: string[];
}

export async function extractPdfText(buffer: Buffer): Promise<PdfText> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { totalPages, pages: text };
}

/**
 * PDF hasil scan hampir tidak menghasilkan teks. Kalau ini terjadi, jalur
 * rekening koran tidak bisa dipakai dan user perlu diberi tahu alasannya,
 * bukan dibiarkan menerima hasil kosong tanpa penjelasan.
 */
export function looksLikeScannedPdf(pdf: PdfText): boolean {
  const total = pdf.pages.join("").replace(/\s/g, "").length;
  return total < 50 * pdf.totalPages;
}
