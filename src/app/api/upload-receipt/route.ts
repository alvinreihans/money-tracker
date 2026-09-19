import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { processReceiptImage, toTransactionRow } from "@/lib/receipt";
import { insertFromImage } from "@/lib/statement-import";
import { dbErrorMessage } from "@/lib/errors";
import type { Transaction } from "@/types/transaction";

// Route ini murni dinamis & stateless: jangan di-cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OCR + rantai LLM bisa memakan puluhan detik pada cold start.
export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export async function POST(req: NextRequest) {
  try {
    // 1. Autentikasi user (RLS butuh session yang valid).
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Ambil & validasi file dari FormData.
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Field 'file' (gambar struk) wajib diisi." },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: `Format tidak didukung: ${file.type}` },
        { status: 415 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Ukuran file melebihi 5 MB." },
        { status: 413 },
      );
    }

    // 3. Pipeline bersama: OCR -> Groq -> Gemini Vision (lihat FALLBACK.md).
    //    Tidak pernah melempar; kegagalan turun menjadi status needs_review.
    const image = Buffer.from(await file.arrayBuffer());
    const result = await processReceiptImage(image, file.type);

    // 4. Simpan. Bila baris rekening koran untuk transaksi yang sama sudah
    //    terlanjur masuk, baris itu disingkirkan — bukti bayar lebih lengkap.
    let inserted: Transaction;
    let supersededStatement = false;
    try {
      const hasil = await insertFromImage(
        supabase,
        user.id,
        toTransactionRow(result, user.id) as unknown as Record<string, unknown>,
      );
      inserted = hasil.transaction as Transaction;
      supersededStatement = hasil.supersededStatement;
    } catch (dbError) {
      return NextResponse.json(
        {
          error: dbErrorMessage(dbError),
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        transaction: inserted,
        status: result.status,
        source: result.source,
        supersededStatement,
        // Jejak keputusan pipeline; membantu saat hasilnya meleset.
        notes: result.notes,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Internal server error.", detail: message },
      { status: 500 },
    );
  }
}
