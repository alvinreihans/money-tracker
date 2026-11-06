/**
 * Uji worker Tesseract DI DALAM bundle standalone.
 *
 * Kenapa ini ada: berkas yang dimuat lewat path rakitan runtime tidak terlihat
 * oleh tracing Next, dan kalau terlewat, kegagalannya senyap — worker thread
 * mati tanpa pesan dan createWorker menggantung sampai fungsinya dimatikan.
 * Menjalankan `npm run dev` tidak pernah menangkapnya, karena di lokal seluruh
 * node_modules tersedia. Satu-satunya cara tahu tanpa deploy adalah menjalankan
 * kode dari kumpulan berkas yang benar-benar dikirim.
 *
 * Pemakaian:
 *   npm run build:standalone
 *   npm run uji:bundle -- [foto-struk.jpg]
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ASAL = path.join(process.cwd(), ".next", "standalone");
const BATAS_MS = 45_000;

if (!fs.existsSync(ASAL)) {
  console.error("Bundle belum ada. Jalankan dulu: npm run build:standalone");
  process.exit(1);
}

/**
 * Bundle disalin ke luar folder project sebelum diuji.
 *
 * Ini bukan kerapian, tapi syarat supaya ujinya sahih. Node mencari modul
 * dengan menyusuri direktori ke atas, jadi selama bundle berada di dalam
 * project, paket yang TIDAK ikut terkirim tetap ketemu di node_modules asli
 * satu tingkat di atasnya. Ujinya lolos, produksinya tetap jatuh.
 *
 * Pernah terjadi persis begitu: uji ini menyatakan bundle lengkap, padahal
 * `bmp-js` tidak pernah ikut. Di Vercel tidak ada induk yang bisa dinaiki.
 */
const BUNDLE = path.join(os.tmpdir(), "money-tracker-uji-bundle");
fs.rmSync(BUNDLE, { recursive: true, force: true });
fs.cpSync(ASAL, BUNDLE, { recursive: true });

// Resolusi modul mengikuti lokasi berkas ini, bukan cwd. Basis require diarahkan
// ke dalam bundle supaya yang dimuat benar-benar node_modules versi ciut itu.
const req = createRequire(path.join(BUNDLE, "index.js"));

// Pasang pendengar error SEBELUM tesseract.js dimuat: spawnWorker.js
// mendestrukturisasi Worker saat di-require, jadi tambalan sesudahnya percuma.
// Tanpa ini, kegagalan di dalam thread tidak meninggalkan jejak apa pun.
const wt = req("node:worker_threads");
const Asli = wt.Worker;
let errorThread = null;
wt.Worker = class extends Asli {
  constructor(...args) {
    super(...args);
    this.on("error", (err) => {
      errorThread = err.message;
    });
  }
};

const { createWorker } = req("tesseract.js");

const mulai = Date.now();
const menyerah = setTimeout(() => {
  console.error(`  GAGAL: menggantung ${Date.now() - mulai} ms`);
  console.error(`  thread melapor: ${errorThread ?? "(tidak ada)"}`);
  process.exit(1);
}, BATAS_MS);

try {
  const worker = await createWorker("ind+eng", undefined, {
    langPath: path.join(BUNDLE, "tessdata"),
    cachePath: os.tmpdir(),
    gzip: false,
  });
  console.log(`  worker siap dalam ${Date.now() - mulai} ms`);

  const foto = process.argv[2];
  if (foto) {
    const { data } = await worker.recognize(fs.readFileSync(foto));
    console.log(
      `  OCR: confidence ${data.confidence.toFixed(1)}, ${data.text.trim().length} karakter`,
    );
  }

  await worker.terminate();

  // Rekening koran (SPEC-impor-rekening): pdfjs-dist dari bundle, dimuat seperti
  // src/lib/rekening/pdf.ts (modul worker di proses yang sama), membaca PDF buatan.
  const pdfLib = createRequire(import.meta.url)("pdf-lib");
  const doc = await pdfLib.PDFDocument.create();
  const hal = doc.addPage([600, 400]);
  const font = await doc.embedFont(pdfLib.StandardFonts.Helvetica);
  hal.drawText("LAPORAN TRANSAKSI FINANSIAL", { x: 40, y: 300, size: 10, font });
  hal.drawText("6,143,500.00", { x: 400, y: 280, size: 10, font });
  const dasar = path.join(BUNDLE, "node_modules", "pdfjs-dist", "legacy", "build");
  globalThis.pdfjsWorker = await import(pathToFileURL(path.join(dasar, "pdf.worker.mjs")).href);
  const pdfjs = await import(pathToFileURL(path.join(dasar, "pdf.mjs")).href);
  const tugas = pdfjs.getDocument({ data: await doc.save(), verbosity: 0, disableFontFace: true, useSystemFonts: false });
  const isi = await (await (await tugas.promise).getPage(1)).getTextContent();
  await tugas.destroy();
  const teks = isi.items.map((i) => i.str).join(" ");
  if (!teks.includes("LAPORAN TRANSAKSI FINANSIAL") || !teks.includes("6,143,500.00")) throw new Error(`pdfjs: teks tidak terbaca (${teks})`);
  console.log("  pdfjs-dist membaca PDF rekening koran.");

  clearTimeout(menyerah);
  console.log("  Bundle lengkap.");
  process.exit(0);
} catch (err) {
  clearTimeout(menyerah);
  console.error(`  GAGAL setelah ${Date.now() - mulai} ms: ${err.message}`);
  console.error(`  thread melapor: ${errorThread ?? "(tidak ada)"}`);
  process.exit(1);
}
