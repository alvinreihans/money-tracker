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

const BUNDLE = path.join(process.cwd(), ".next", "standalone");
const BATAS_MS = 45_000;

if (!fs.existsSync(BUNDLE)) {
  console.error("Bundle belum ada. Jalankan dulu: npm run build:standalone");
  process.exit(1);
}

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

  clearTimeout(menyerah);
  await worker.terminate();
  console.log("  Bundle lengkap.");
  process.exit(0);
} catch (err) {
  clearTimeout(menyerah);
  console.error(`  GAGAL setelah ${Date.now() - mulai} ms: ${err.message}`);
  console.error(`  thread melapor: ${errorThread ?? "(tidak ada)"}`);
  process.exit(1);
}
