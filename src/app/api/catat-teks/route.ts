import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { hasilKirimanUlang, processReceiptText, toTransactionRow } from "@/lib/receipt";
import { bacaanDari } from "@/lib/jejak";
import { catatJejakDraft } from "@/lib/jejak-server";
import { ambilKonteksAI } from "@/lib/kategori-server";
import { simpanTransaksi } from "@/lib/simpan-transaksi";
import { dbErrorMessage } from "@/lib/errors";
import { TEKS_MAKS } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rantai model Groq bisa mencoba beberapa model sebelum menyerah.
export const maxDuration = 30;

/**
 * Catat transaksi dari teks bebas ("kopi 25rb gopay"). Hasilnya selalu draft
 * yang dicek dulu di kartu "Periksa dulu" (SPEC-periksa-dulu); kegagalan juga
 * turun jadi draft, bukan error.
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

  // `hasil`: hasil baca yang dikirim balik klien (tanpa AI lagi), seperti di
  // /api/upload-receipt — mis. uji E2E yang meniru jawaban AI.
  const konteks = await ambilKonteksAI(supabase);
  const kiriman = (body as { hasil?: unknown } | null)?.hasil;
  const result = kiriman && typeof kiriman === "object" ? hasilKirimanUlang(kiriman, konteks) : await processReceiptText(text, konteks);

  try {
    const { transaction, pertanyaan, cicilan } = await simpanTransaksi(supabase, user.id, {
      ...toTransactionRow(result, user.id),
      // Kalau jadi draft, teks aslinya ikut disimpan supaya bisa dibenerin
      // tanpa harus mengingat lagi apa yang diketik (dibuang kalau tidak).
      raw_ocr_text: text,
      source: "text",
    });
    // Belanja paylater yang langsung jadi rencana cicilan (SPEC-paylater).
    if (cicilan) return NextResponse.json({ cicilan }, { status: 201 });
    // Jejak "Cara dicatat" (SPEC-periksa-dulu §4): teks ketikan & hasil bacanya.
    const tx = transaction as Transaction;
    if (tx.status === "needs_review") await catatJejakDraft(supabase, tx.id, { asal: "ketikan", teks: text, bacaan: bacaanDari(result.extracted) });

    return NextResponse.json(
      {
        transaction: transaction as Transaction,
        // Status akhir: bisa jadi draft di simpanTransaksi (kantong tak cocok).
        status: (transaction as Transaction).status,
        // Yang perlu ditanyakan di obrolan kalau belum lengkap.
        pertanyaan,
        notes: result.notes,
      },
      { status: 201 },
    );
  } catch (dbError) {
    return NextResponse.json({ error: dbErrorMessage(dbError) }, { status: 500 });
  }
}
