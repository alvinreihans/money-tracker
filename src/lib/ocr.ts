import path from "node:path";
import os from "node:os";
import { createWorker, type Worker } from "tesseract.js";

/**
 * Layer OCR: gambar masuk -> teks + skor keyakinan keluar.
 *
 * Interface-nya sengaja dibuat sempit (Buffer -> OcrResult) supaya mesin OCR
 * bisa ditukar (mis. ke PP-OCR ONNX) tanpa menyentuh layer LLM maupun route.
 */

export interface OcrResult {
  /** Teks mentah hasil OCR, sudah di-trim. */
  text: string;
  /** Keyakinan rata-rata halaman, 0-100. */
  confidence: number;
  /** false kalau preprocessing gagal dan kita memakai gambar apa adanya. */
  preprocessed: boolean;
}

// Struk Indonesia: campuran kata Indonesia + nama merchant/istilah Inggris.
const LANGS = "ind+eng";

// traineddata di-vendor di repo supaya tidak mengunduh dari CDN tiap cold start.
const TESSDATA_DIR = path.join(process.cwd(), "tessdata");

// --- Ambang gerbang kualitas (lihat FALLBACK.md) ---
export const OCR_MIN_CONFIDENCE = 60;
export const OCR_MIN_LENGTH = 20;

/**
 * Teks OCR dianggap layak dikirim ke LLM hanya bila lolos ketiganya.
 * Kalau tidak lolos, jangan buang kuota LLM teks — langsung eskalasi ke vision.
 * Teks rusak tidak membuat LLM error, tapi membuatnya menebak dengan yakin.
 */
export function isOcrUsable(result: OcrResult): boolean {
  return (
    result.confidence >= OCR_MIN_CONFIDENCE &&
    result.text.length >= OCR_MIN_LENGTH &&
    /\d/.test(result.text) // struk tanpa satu pun angka pasti gagal baca
  );
}

// Worker mahal dibuat (load WASM + traineddata), jadi di-reuse per cold-start.
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(LANGS, undefined, {
      langPath: TESSDATA_DIR,
      cachePath: os.tmpdir(), // satu-satunya direktori yang writable di serverless
      gzip: false,
    }).catch((err: unknown) => {
      workerPromise = null; // reset supaya request berikutnya mencoba lagi
      throw err;
    });
  }
  return workerPromise;
}

/**
 * Preprocessing yang menentukan hidup-matinya akurasi pada foto struk thermal.
 * Tesseract dirancang untuk hasil scan, bukan foto HP dengan kontras rendah,
 * kertas melengkung, dan pencahayaan tidak rata.
 */
async function preprocess(input: Buffer): Promise<Buffer> {
  // Dimuat saat dipakai, bukan di puncak berkas. sharp punya binary native
  // yang bisa gagal dimuat di lingkungan tertentu; kalau di-import statis,
  // kegagalannya menjatuhkan SELURUH modul sehingga route-nya balas 500 —
  // padahal preprocessing cuma penyempurna, dan OCR masih bisa jalan tanpanya.
  // Pemanggilnya sudah membungkus fungsi ini dengan try/catch.
  const { default: sharp } = await import("sharp");

  return sharp(input)
    .rotate() // auto-orient dari metadata EXIF
    .grayscale()
    // Tesseract butuh tinggi huruf ~30px. Gambar kecil (struk lama, hasil
    // kompresi berulang) harus DIPERBESAR, bukan dibiarkan — pada 180px lebar,
    // huruf struk cuma ~5px dan OCR mengembalikan nol karakter.
    // lanczos3 menjaga tepi huruf tetap tegas saat diperbesar.
    .resize({ width: 1500, kernel: "lanczos3" })
    .normalize() // regangkan histogram: tinta pudar jadi lebih terbaca
    .sharpen()
    // Foto HP sering membawa metadata DPI ngawur (mis. 25 dpi), membuat
    // Tesseract menebak dan memperingatkan. Nyatakan 300 dpi secara eksplisit.
    .withMetadata({ density: 300 })
    .png()
    .toBuffer();
}

/** Jalankan OCR pada gambar struk. Tidak pernah melempar karena preprocessing. */
export async function runOcr(input: Buffer): Promise<OcrResult> {
  let image = input;
  let preprocessed = false;

  try {
    image = await preprocess(input);
    preprocessed = true;
  } catch {
    // Format aneh / file rusak: lanjut dengan buffer asli, biar Tesseract
    // yang memutuskan. Lebih baik hasil jelek daripada gagal total.
  }

  const worker = await getWorker();
  const { data } = await worker.recognize(image);

  return {
    text: data.text.trim(),
    confidence: data.confidence,
    preprocessed,
  };
}
