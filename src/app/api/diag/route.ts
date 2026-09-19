import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint diagnostik SEMENTARA.
 *
 * Di produksi, /api/upload-receipt dan /api/telegram/webhook membalas 500
 * sementara /api/upload-statement membalas 401 dengan benar. Bedanya cuma satu:
 * keduanya mengimpor @/lib/ocr. Route ini memuat tiap ketergantungannya satu
 * per satu supaya ketahuan mana yang gagal — menebak dari luar sudah dua kali
 * meleset.
 *
 * HAPUS setelah penyebabnya ketemu.
 */
async function coba(nama: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    return { nama, ok: true };
  } catch (err) {
    return {
      nama,
      ok: false,
      pesan: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const hasil = [
    await coba("sharp", () => import("sharp")),
    await coba("tesseract.js", () => import("tesseract.js")),
    await coba("unpdf", () => import("unpdf")),
    await coba("@/lib/ocr", () => import("@/lib/ocr")),
    await coba("@/lib/receipt", () => import("@/lib/receipt")),
  ];

  // Cek keberadaan berkas yang dimuat lewat path runtime, bukan lewat import.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const berkas = [
    "tessdata/ind.traineddata",
    "node_modules/@img/sharp-linux-x64",
    "node_modules/@img/sharp-libvips-linux-x64",
  ].map((p) => ({ path: p, ada: fs.existsSync(path.join(process.cwd(), p)) }));

  // Isi folder @img memberi tahu paket platform mana yang benar-benar sampai
  // ke fungsi — glob tracing-nya sudah dipasang tapi sharp tetap gagal.
  function isi(relatif: string): string[] {
    try {
      return fs.readdirSync(path.join(process.cwd(), relatif));
    } catch (err) {
      return [`(gagal: ${err instanceof Error ? err.message : String(err)})`];
    }
  }

  return NextResponse.json({
    cwd: process.cwd(),
    hasil,
    berkas,
    img: isi("node_modules/@img"),
    libvips: isi("node_modules/@img/sharp-libvips-linux-x64/lib"),
  });
}
