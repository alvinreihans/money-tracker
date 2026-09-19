/**
 * Diagnostik pipeline struk.
 *
 * Menjalankan KODE PRODUKSI yang sama persis (src/lib/receipt.ts), lalu
 * membongkar tiap tahapnya supaya kelihatan di mana hasilnya meleset:
 * teks OCR mentah, skor confidence, lolos/tidaknya gerbang kualitas, dan
 * jalur mana yang akhirnya dipakai.
 *
 * Pemakaian:
 *   npm run test:receipt -- foto.jpg
 *   npm run test:receipt -- folder-struk/
 *   npm run test:receipt -- foto.jpg --compare   (bandingkan dgn Gemini Vision)
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { processReceiptImage } from "@/lib/receipt";
import { extractWithGeminiVision, isValidExtraction } from "@/lib/extract";
import { OCR_MIN_CONFIDENCE, OCR_MIN_LENGTH } from "@/lib/ocr";
import type { ExtractedReceipt } from "@/types/transaction";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

// Hasil preprocess disimpan supaya bisa dilihat: kalau gambar ini saja sudah
// tidak terbaca mata, jangan harap Tesseract bisa membacanya.
const OUT_DIR = path.resolve(".receipt-test");

const args = process.argv.slice(2);
const COMPARE = args.includes("--compare");
// Tiap fallback ke vision memakan satu panggilan Gemini, dan kuota harian
// Gemini jauh lebih kecil daripada Groq. Uji besar tanpa rem akan menghabiskannya.
const NO_VISION = args.includes("--no-vision");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 10;

if (NO_VISION) process.env.DISABLE_VISION_FALLBACK = "1";

const inputs = args.filter((a) => !a.startsWith("--"));

if (inputs.length === 0) {
  console.error(`
${c.bold("Diagnostik pipeline struk")}

  npm run test:receipt -- <file-atau-folder> [opsi]

  --limit=N     maksimal N struk (default 10). Pakai --limit=0 untuk semua.
  --no-vision   matikan fallback Gemini Vision. Hemat kuota saat Anda hanya
                ingin menilai mutu Tesseract+Groq.
  --compare     jalankan juga Gemini Vision sebagai pembanding, untuk menilai
                apakah jalur Tesseract+Groq sudah cukup baik.

  ${c.dim("Ingat: tiap fallback/pembanding vision memakai kuota Gemini harian Anda.")}
`);
  process.exit(1);
}

/** Kumpulkan semua file gambar dari daftar file/folder. */
function collectFiles(list: string[]): string[] {
  const out: string[] = [];
  for (const input of list) {
    if (!fs.existsSync(input)) {
      console.error(c.red(`Tidak ditemukan: ${input}`));
      continue;
    }
    if (fs.statSync(input).isDirectory()) {
      for (const f of fs.readdirSync(input).sort()) {
        if (IMAGE_EXT.has(path.extname(f).toLowerCase())) out.push(path.join(input, f));
      }
    } else if (IMAGE_EXT.has(path.extname(input).toLowerCase())) {
      out.push(input);
    } else {
      console.error(c.red(`Bukan gambar yang didukung: ${input}`));
    }
  }
  return out;
}

function fmtIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function ringkas(e: ExtractedReceipt | null): string {
  if (!e) return c.dim("(tidak ada)");
  return [
    `${c.bold(fmtIDR(e.amount))}`,
    `${e.merchant ?? c.dim("tanpa merchant")}`,
    `${e.category}`,
    `${e.transaction_date}`,
    e.payment_method ?? c.dim("tanpa metode"),
  ].join(c.dim(" | "));
}

const semua = collectFiles(inputs);
if (semua.length === 0) {
  console.error(c.red("\nTidak ada file gambar untuk diuji.\n"));
  process.exit(1);
}

const files = LIMIT > 0 ? semua.slice(0, LIMIT) : semua;
if (files.length < semua.length) {
  console.log(
    c.yellow(
      `\nDitemukan ${semua.length} gambar, diuji ${files.length} saja (--limit=${LIMIT}).` +
        `\nSatu struk butuh 5-12 detik dan bisa memakai kuota Gemini; pakai --limit=0 untuk semua.`,
    ),
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(
  `\n${c.bold(`Menguji ${files.length} struk`)}  ${c.dim(`gerbang: confidence >= ${OCR_MIN_CONFIDENCE}, panjang >= ${OCR_MIN_LENGTH}, ada digit`)}\n`,
);

let lolos = 0;
let draft = 0;
let viaVision = 0;

for (const file of files) {
  const nama = path.basename(file);
  console.log(c.cyan("━".repeat(72)));
  console.log(c.bold(nama));

  const buffer = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] ?? "image/jpeg";

  // Info gambar asli
  try {
    const meta = await sharp(buffer).metadata();
    console.log(
      c.dim(
        `  ${meta.width}x${meta.height}px, ${(buffer.length / 1024).toFixed(0)} KB, ${mime}`,
      ),
    );
  } catch {
    console.log(c.dim(`  ${(buffer.length / 1024).toFixed(0)} KB, ${mime}`));
  }

  // Simpan hasil preprocess untuk diperiksa mata
  try {
    const pre = await sharp(buffer)
      .rotate()
      .grayscale()
      .resize({ width: 1500, withoutEnlargement: true })
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
    const outPath = path.join(OUT_DIR, `${path.parse(nama).name}.preprocessed.png`);
    fs.writeFileSync(outPath, pre);
    console.log(c.dim(`  preprocess -> ${path.relative(process.cwd(), outPath)}`));
  } catch (err) {
    console.log(c.red(`  preprocess gagal: ${(err as Error).message}`));
  }

  // --- Jalankan pipeline produksi ---
  const t0 = Date.now();
  const result = await processReceiptImage(buffer, mime);
  const durasi = Date.now() - t0;

  console.log(`\n  ${c.bold("Jejak keputusan")} ${c.dim(`(${durasi}ms)`)}`);
  for (const note of result.notes) console.log(`    ${c.dim("-")} ${note}`);

  if (result.rawOcrText) {
    console.log(`\n  ${c.bold("Teks OCR mentah")}`);
    const baris = result.rawOcrText.split("\n").filter((l) => l.trim());
    for (const l of baris.slice(0, 25)) console.log(c.dim(`    | ${l}`));
    if (baris.length > 25) console.log(c.dim(`    | ... (${baris.length - 25} baris lagi)`));
  }

  const label =
    result.status === "confirmed"
      ? result.source === "groq"
        ? c.green("CONFIRMED via Tesseract+Groq")
        : c.yellow("CONFIRMED via Gemini Vision (OCR tidak cukup)")
      : c.red("NEEDS_REVIEW (semua jalur gagal)");

  console.log(`\n  ${c.bold("Hasil")}  ${label}`);
  console.log(`  ${ringkas(result.extracted)}`);

  if (result.status === "confirmed" && result.source === "groq") lolos++;
  else if (result.status === "confirmed") viaVision++;
  else draft++;

  // --- Pembanding: Gemini Vision langsung pada gambar asli ---
  if (COMPARE && result.source !== "gemini_vision") {
    try {
      const v = await extractWithGeminiVision(buffer.toString("base64"), mime);
      console.log(`\n  ${c.bold("Pembanding Gemini Vision")}`);
      console.log(`  ${ringkas(v)}`);

      const a = result.extracted;
      if (a && isValidExtraction(v)) {
        const cocok = a.amount === v.amount;
        console.log(
          cocok
            ? `  ${c.green("✓ nominal cocok")}`
            : `  ${c.red(`✗ nominal BEDA: OCR ${fmtIDR(a.amount)} vs Vision ${fmtIDR(v.amount)}`)}`,
        );
      }
    } catch (err) {
      console.log(c.dim(`  pembanding gagal: ${(err as Error).message}`));
    }
  }

  console.log();
}

// --- Ringkasan ---
console.log(c.cyan("━".repeat(72)));
console.log(c.bold("\nRingkasan\n"));
console.log(`  ${c.green("Tesseract+Groq berhasil")}  ${lolos}/${files.length}`);
console.log(`  ${c.yellow("Jatuh ke Gemini Vision")}    ${viaVision}/${files.length}`);
console.log(`  ${c.red("Gagal total (draft)")}       ${draft}/${files.length}\n`);

const rasio = files.length > 0 ? lolos / files.length : 0;
if (rasio >= 0.8) {
  console.log(c.green("  Tesseract sudah memadai. Lanjut pakai konfigurasi ini.\n"));
} else if (rasio >= 0.5) {
  console.log(
    c.yellow(
      "  Separuh-separuh. Coba setel preprocessing di src/lib/ocr.ts dulu\n" +
        "  sebelum memutuskan ganti mesin OCR.\n",
    ),
  );
} else {
  console.log(
    c.red(
      "  Tesseract kewalahan pada foto struk Anda. Pertimbangkan tukar mesin\n" +
        "  OCR ke PP-OCR ONNX — cukup ganti isi src/lib/ocr.ts.\n",
    ),
  );
}

process.exit(0);
