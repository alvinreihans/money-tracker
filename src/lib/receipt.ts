import { runOcr, isOcrUsable, type OcrResult } from "@/lib/ocr";
import {
  extractWithGroq,
  extractWithGeminiVision,
  isValidExtraction,
  nominalDariPromo,
  tenorDariTeks,
  type KonteksAI,
} from "@/lib/extract";
import { isoLokal } from "@/lib/format";
import { KATEGORI_BAWAAN } from "@/lib/kategori";
import type { ExtractedReceipt } from "@/types/transaction";

/**
 * Orkestrasi pipeline ekstraksi struk sesuai FALLBACK.md.
 *
 * Fungsi di file ini adalah SATU-SATUNYA jalur logika ekstraksi; route
 * upload struk dan catat-teks sama-sama memanggilnya.
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
  /** Bukan kolom: dicocokkan ke kantong_tujuan_id oleh simpanTransaksi lalu dibuang. */
  payment_target: string | null;
  /** Bukan kolom: jadi transaksi ikutan oleh simpanTransaksi (barisIkutan). */
  biaya_admin: number | null;
  cashback: number | null;
  /** Bukan kolom: Lend & Borrow dan rencana cicilan, diolah simpanTransaksi. */
  pinjaman: ExtractedReceipt["pinjaman"];
  cicilan: string | null;
  /** Bukan kolom: belanja paylater (SPEC-paylater), diolah simpanTransaksi. */
  info_paylater: ExtractedReceipt["paylater"];
  transaction_date: string;
  /** Bukan kolom: jam & petunjuknya dari AI, diolah simpanTransaksi jadi `waktu`. */
  jam: string | null;
  petunjuk_jam: ExtractedReceipt["time_hint"];
  status: ReceiptStatus;
  raw_ocr_text: string | null;
  /** receipt | payment_proof | text — ditampilkan sebagai "Masuk lewat". */
  source: string;
}

/** Hari ini menurut WIB (server berjalan di UTC). */
function today(): string {
  return isoLokal(new Date());
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
    payment_target: null,
    fee: null,
    cashback: null,
    pinjaman: null,
    cicilan: null,
    paylater: null,
    transaction_date: today(),
    time: null,
    time_hint: null,
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
  konteks: KonteksAI = { kategori: KATEGORI_BAWAAN },
  /** Keterangan yang diketik user bersama fotonya (mis. "pakai BCA"). */
  catatan?: string,
): Promise<ProcessedReceipt> {
  const notes: string[] = [];
  let ocr: OcrResult | null = null;
  let best: ExtractedReceipt | null = null;

  // --- 1. OCR ---
  // Ukuran gambar ikut dicatat: foto kamera dan screenshot galeri bisa
  // berbeda jauh. Angka inilah yang membedakan "gambarnya sudah telanjur
  // kecil" dari "OCR-nya yang bermasalah".
  notes.push(`Gambar masuk: ${Math.round(image.byteLength / 1024)} KB, ${mimeType}`);

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
      const { extracted, model } = await extractWithGroq(denganCatatan(ocr.text, catatan), konteks);
      // Nominal yang hanya ada di baris promo = nominal asli tak terbaca:
      // jangan dipakai, biar vision membaca gambarnya (atau ditanyakan).
      const promo = nominalDariPromo(ocr.text, extracted.amount);
      best = promo ? { ...extracted, amount: 0 } : extracted;
      if (!promo && isValidExtraction(extracted, konteks.kategori)) {
        notes.push(`Ekstraksi berhasil via Groq (${model})`);
        return done("confirmed", extracted, ocr, "groq", notes);
      }
      notes.push(
        promo
          ? `Groq (${model}) mengambil nominal dari baris promo (${extracted.amount}), eskalasi ke vision`
          : `Groq (${model}) menghasilkan data tidak valid, eskalasi ke vision`,
      );
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
      konteks,
      catatan,
    );
    best = extracted;
    if (isValidExtraction(extracted, konteks.kategori)) {
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
 * Pipeline untuk input TEKS (mis. "kopi 25rb gopay" di kolom Catat).
 * Tidak ada OCR dan tidak ada fallback vision — tidak ada gambar untuk dibaca.
 */
export async function processReceiptText(
  text: string,
  konteks: KonteksAI = { kategori: KATEGORI_BAWAAN },
): Promise<ProcessedReceipt> {
  const notes: string[] = [];

  try {
    const { extracted, model } = await extractWithGroq(text, konteks);
    if (isValidExtraction(extracted, konteks.kategori)) {
      notes.push(`Ekstraksi berhasil via Groq (${model})`);
      return done("confirmed", extracted, null, "groq", notes, text);
    }
    notes.push(`Groq (${model}) menghasilkan data tidak valid`);
    return done("needs_review", extracted, null, "groq", notes, text);
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
    payment_target: e.payment_target,
    biaya_admin: e.fee,
    cashback: e.cashback,
    pinjaman: e.pinjaman,
    cicilan: e.cicilan,
    info_paylater: e.paylater,
    transaction_date: e.transaction_date,
    jam: e.time,
    petunjuk_jam: e.time_hint,
    status: result.status,
    // Dibuang lagi oleh simpanTransaksi kalau transaksinya akhirnya tidak
    // jadi draft — draft bisa juga muncul di sana (kantong tak cocok).
    raw_ocr_text: result.rawOcrText,
    // Membedakan screenshot bukti bayar dari struk kertas di halaman detail.
    source: e.document_type,
  };
}

function done(
  status: ReceiptStatus,
  extracted: ExtractedReceipt | null,
  ocr: OcrResult | null,
  source: ExtractionSource,
  notes: string[],
  /** Teks yang dibaca model (OCR atau ketikan), untuk melengkapi tenor paylater. */
  teks = ocr?.text,
): ProcessedReceipt {
  // "SPayLater - 1 / Bulan" yang dipecah OCR: tenornya dibaca langsung dari teks.
  if (extracted?.paylater && !extracted.paylater.tenor && teks) {
    const tenor = tenorDariTeks(teks);
    if (tenor) {
      extracted = { ...extracted, paylater: { ...extracted.paylater, tenor } };
      notes.push(`Tenor paylater dari teks: ${tenor}`);
    }
  }
  return {
    status,
    extracted,
    rawOcrText: ocr?.text ?? null,
    ocrConfidence: ocr?.confidence ?? null,
    source,
    notes,
  };
}

/**
 * Teks untuk AI ditambah keterangan dari user. Keterangan diletakkan
 * terpisah dan diberi label, supaya model tahu itu bukan bagian struk.
 */
export function denganCatatan(teks: string, catatan?: string): string {
  return catatan?.trim() ? `${teks}\n\n---\nCatatan dari pengguna (lebih dipercaya untuk kantong & keterangan): ${catatan.trim()}` : teks;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}
