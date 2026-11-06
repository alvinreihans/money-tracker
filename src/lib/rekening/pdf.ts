import type { BarisPdf } from "@/lib/rekening/jenis";
import { susunBaris } from "@/lib/rekening/teks";

/**
 * Teks PDF rekening koran, dibaca di server dengan pdfjs-dist (build legacy
 * untuk Node), tanpa AI dan tanpa worker thread: modul worker-nya dimuat di
 * proses yang sama (`globalThis.pdfjsWorker`), jadi tidak ada berkas yang
 * dirakit path-nya saat runtime — aman di serverless (lihat next.config.ts).
 * PDF tidak disimpan; hanya teks hasilnya yang dipakai.
 */

let siap: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

function muat() {
  siap ??= (async () => {
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })();
  return siap;
}

/** Galat PDF yang bukan soal isi (rusak, berpassword). */
export class GalatPdf extends Error {}

export async function teksPdf(data: Uint8Array, maksHalaman = 200): Promise<BarisPdf[]> {
  const pdfjs = await muat();
  const tugas = pdfjs.getDocument({ data, verbosity: 0, disableFontFace: true, useSystemFonts: false });
  let doc;
  try {
    doc = await tugas.promise;
  } catch (e) {
    await tugas.destroy();
    const nama = (e as { name?: string })?.name;
    throw new GalatPdf(nama === "PasswordException" ? "PDF ini berpassword. Buka kuncinya dulu di aplikasi bank." : "Berkas ini bukan PDF yang bisa dibaca.");
  }
  try {
    if (doc.numPages > maksHalaman) throw new GalatPdf(`PDF terlalu panjang (lebih dari ${maksHalaman} halaman).`);
    const halaman: { items: { x: number; y: number; s: string }[] }[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const isi = await (await doc.getPage(p)).getTextContent();
      halaman.push({
        items: isi.items.flatMap((it) => ("str" in it ? [{ x: it.transform[4] as number, y: it.transform[5] as number, s: it.str }] : [])),
      });
    }
    return susunBaris(halaman);
  } finally {
    await tugas.destroy();
  }
}
