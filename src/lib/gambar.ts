import sharp from "sharp";

/** Lebar maksimal gambar yang dikirim ke Gemini (SPEC-catat-andal). */
export const LEBAR_MAKS = 1080;

/**
 * Kecilkan foto/screenshot sebelum dibaca Gemini: diputar sesuai EXIF, lebar
 * maks 1080px, JPEG q80. Diuji 24 Okt: ±80% lebih kecil dan tetap terbaca
 * utuh; 720px mulai kehilangan merchant & paylater.
 */
export async function kompresGambar(gambar: Buffer): Promise<Buffer> {
  return sharp(gambar).rotate().resize({ width: LEBAR_MAKS, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}
