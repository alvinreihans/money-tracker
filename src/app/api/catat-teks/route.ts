import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { processReceiptText, toTransactionRow } from "@/lib/receipt";
import { ambilKategori } from "@/lib/kategori-server";
import { simpanTransaksi } from "@/lib/simpan-transaksi";
import { dbErrorMessage } from "@/lib/errors";
import { TEKS_MAKS } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rantai model Groq bisa mencoba beberapa model sebelum menyerah.
export const maxDuration = 30;

/**
 * Catat transaksi dari teks bebas ("kopi 25rb gopay"). Kegagalan turun jadi
 * draft, bukan error.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  const raw = (body as { text?: unknown } | null)?.text;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Teksnya masih kosong." }, { status: 400 });
  }
  if (text.length > TEKS_MAKS) {
    return NextResponse.json(
      { error: `Teksnya kepanjangan, maksimal ${TEKS_MAKS} karakter.` },
      { status: 400 },
    );
  }

  const result = await processReceiptText(text, await ambilKategori(supabase));

  try {
    const { transaction } = await simpanTransaksi(supabase, user.id, {
      ...toTransactionRow(result, user.id),
      // Kalau jadi draft, teks aslinya ikut disimpan supaya bisa dibenerin
      // tanpa harus mengingat lagi apa yang diketik (dibuang kalau tidak).
      raw_ocr_text: text,
      source: "text",
    });

    return NextResponse.json(
      {
        transaction: transaction as Transaction,
        // Status akhir: bisa jadi draft di simpanTransaksi (kantong tak cocok).
        status: (transaction as Transaction).status,
        notes: result.notes,
      },
      { status: 201 },
    );
  } catch (dbError) {
    return NextResponse.json({ error: dbErrorMessage(dbError) }, { status: 500 });
  }
}
