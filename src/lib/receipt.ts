import { runOcr, isOcrUsable, type OcrResult } from "@/lib/ocr";
import {
  extractWithGroq,
  extractWithGeminiVision,
  isValidExtraction,
} from "@/lib/extract";
import type { ExtractedReceipt } from "@/types/transaction";

/**
 * Orkestrasi pipeline ekstraksi struk sesuai FALLBACK.md.
 *
 * Fungsi di file ini adalah SATU-SATUNYA jalur logika; route web dan webhook
 * Telegram sama-sama memanggilnya. Webhook sengaja tidak memanggil endpoint
 * upload lewat HTTP: itu hanya menambah latensi dan satu invocation serverless.
 */

export type ReceiptStatus = "confirmed" | "needs_review";
export type ExtractionSource = "groq" | "gemini_vision" | "none";

export interface ProcessedReceipt {
  status: ReceiptStatus;
  /** Hasil terbaik yang didapat. Bisa tetap terisi walau status needs_review. */
  extracted: ExtractedReceipt | null;
  /** Teks OCR mentah, disimpan agar user bisa koreksi manual saat pipeline gagal. */
  rawOcrText: string | null;
  ocrConfidence: number | null;
  source: ExtractionSource;
  /** Jejak keputusan, berguna untuk debugging dan pesan balasan ke user. */
  notes: string[];
}

/** Baris siap-insert untuk tabel `transactions`. */
export interface TransactionRow {
  user_id: string;
  amount: number;
  type: string;
  category: string;
  merchant: string | null;
  description: string | null;
  payment_method: string | null;
  transaction_date: string;
  status: ReceiptStatus;
  raw_ocr_text: string | null;
  /** receipt | payment_proof — menentukan perilaku dedup saat impor statement. */
  source: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Draft kosong: dipakai kalau tidak ada satu pun ekstraksi yang berhasil. */
function emptyDraft(): ExtractedReceipt {
  return {
    amount: 0,
    type: "expense",
    category: "other",
    merchant: null,
    description: null,
    payment_method: null,
    transaction_date: today(),
    document_type: "receipt",
  };
}

/**
 * Pipeline penuh untuk GAMBAR struk.
 *
 * Tidak pernah melempar: kegagalan di tiap tahap diturunkan menjadi status
 * `needs_review` supaya data user tidak hilang. Struk yang gagal dibaca tetap
 * tersimpan bersama teks OCR mentahnya untuk dikoreksi manual.
 */
export async function processReceiptImage(
  image: Buffer,
  mimeType: string,
): Promise<ProcessedReceipt> {
  const notes: string[] = [];
  let ocr: OcrResult | null = null;
  let best: ExtractedReceipt | null = null;

  // --- 1. OCR ---
  try {
    ocr = await runOcr(image);
    notes.push(
      `OCR selesai (confidence ${ocr.confidence.toFixed(1)}, ${ocr.text.length} karakter${ocr.preprocessed ? "" : ", tanpa preprocess"})`,
    );
  } catch (err) {
    notes.push(`OCR gagal: ${errMsg(err)}`);
  }

  // --- 2. Gerbang kualitas + rantai Groq ---
  // Teks yang tidak lolos gerbang sengaja TIDAK dikirim ke Groq: LLM teks tidak
  // bisa menyelamatkan teks rusak, dia hanya akan menebak dengan percaya diri.
  if (ocr && isOcrUsable(ocr)) {
    try {
      const { extracted, model } = await extractWithGroq(ocr.text);
      best = extracted;
      if (isValidExtraction(extracted)) {
        notes.push(`Ekstraksi berhasil via Groq (${model})`);
        return done("confirmed", extracted, ocr, "groq", notes);
      }
      notes.push(`Groq (${model}) menghasilkan data tidak valid, eskalasi ke vision`);
    } catch (err) {
      notes.push(`Seluruh rantai Groq gagal: ${errMsg(err)}`);
    }
  } else if (ocr) {
    notes.push("Teks OCR tidak lolos gerbang kualitas, lewati Groq");
  }

  // --- 3. Jaring pengaman: Gemini Vision pada gambar ASLI ---
  // Bisa dimatikan lewat env: berguna saat kuota Gemini habis (lebih baik
  // langsung jadi draft daripada menunggu panggilan yang pasti ditolak) dan
  // saat menguji mutu Tesseract+Groq tanpa membakar kuota.
  if (process.env.DISABLE_VISION_FALLBACK === "1") {
    notes.push("Fallback Gemini Vision dimatikan (DISABLE_VISION_FALLBACK=1)");
    return done("needs_review", best ?? emptyDraft(), ocr, "none", notes);
  }

  try {
    const extracted = await extractWithGeminiVision(
      image.toString("base64"),
      mimeType,
    );
    best = extracted;
    if (isValidExtraction(extracted)) {
      notes.push("Ekstraksi berhasil via Gemini Vision");
      return done("confirmed", extracted, ocr, "gemini_vision", notes);
    }
    notes.push("Gemini Vision menghasilkan data tidak valid");
  } catch (err) {
    notes.push(`Gemini Vision gagal: ${errMsg(err)}`);
  }

  // --- 4. Semua jalur gagal: simpan sebagai draft, jangan buang data user ---
  return done("needs_review", best ?? emptyDraft(), ocr, "none", notes);
}

/**
 * Pipeline untuk input TEKS (mis. pesan Telegram "kopi 25rb gopay").
 * Tidak ada OCR dan tidak ada fallback vision — tidak ada gambar untuk dibaca.
 */
export async function processReceiptText(
  text: string,
): Promise<ProcessedReceipt> {
  const notes: string[] = [];

  try {
    const { extracted, model } = await extractWithGroq(text);
    if (isValidExtraction(extracted)) {
      notes.push(`Ekstraksi berhasil via Groq (${model})`);
      return done("confirmed", extracted, null, "groq", notes);
    }
    notes.push(`Groq (${model}) menghasilkan data tidak valid`);
    return done("needs_review", extracted, null, "groq", notes);
  } catch (err) {
    notes.push(`Seluruh rantai Groq gagal: ${errMsg(err)}`);
    return done("needs_review", emptyDraft(), null, "none", notes);
  }
}

/** Ubah hasil pipeline menjadi baris database. */
export function toTransactionRow(
  result: ProcessedReceipt,
  userId: string,
): TransactionRow {
  const e = result.extracted ?? emptyDraft();
  return {
    user_id: userId,
    amount: e.amount,
    type: e.type,
    category: e.category,
    merchant: e.merchant,
    description: e.description,
    payment_method: e.payment_method,
    transaction_date: e.transaction_date,
    status: result.status,
    // Teks OCR hanya disimpan saat butuh koreksi manual — kalau ekstraksi
    // berhasil, menyimpannya cuma menggemukkan tabel tanpa guna.
    raw_ocr_text: result.status === "needs_review" ? result.rawOcrText : null,
    // Bukti bayar digital akan muncul lagi sebagai baris rekening koran;
    // menandainya di sini yang membuat deduplikasi bisa bekerja nanti.
    source: e.document_type,
  };
}

function done(
  status: ReceiptStatus,
  extracted: ExtractedReceipt | null,
  ocr: OcrResult | null,
  source: ExtractionSource,
  notes: string[],
): ProcessedReceipt {
  return {
    status,
    extracted,
    rawOcrText: ocr?.text ?? null,
    ocrConfidence: ocr?.confidence ?? null,
    source,
    notes,
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}
