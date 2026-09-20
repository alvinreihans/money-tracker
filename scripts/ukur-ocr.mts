/**
 * Ukur berapa lama tahap OCR sebenarnya, dipisah antara penyiapan worker dan
 * pengenalan teks.
 *
 * Tenggat di src/lib/ocr.ts hanya berguna kalau angkanya berdasar ukuran, bukan
 * tebakan. Cold start di serverless lebih lambat daripada di sini, jadi angka
 * dari skrip ini dipakai sebagai lantai, bukan sebagai patokan pas.
 */
import fs from "node:fs";
import { runOcr } from "@/lib/ocr";

const berkas = process.argv[2];
if (!berkas) {
  console.error("Pemakaian: npm run ukur:ocr -- foto.jpg");
  process.exit(1);
}

const buf = fs.readFileSync(berkas);

const t0 = Date.now();
const hasil = await runOcr(buf);
const cold = Date.now() - t0;

const t1 = Date.now();
await runOcr(buf);
const warm = Date.now() - t1;

console.log(`  cold (worker + kenali) : ${cold} ms`);
console.log(`  warm (kenali saja)     : ${warm} ms`);
console.log(`  siapkan worker (selisih): ~${cold - warm} ms`);
console.log(`  confidence ${hasil.confidence.toFixed(1)}, ${hasil.text.length} karakter`);

// Worker Tesseract menahan event loop tetap hidup; tanpa ini skrip tidak keluar.
process.exit(0);
