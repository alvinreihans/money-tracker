import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { insertFromImage } from "@/lib/statement-import";
import { dbErrorMessage } from "@/lib/errors";
import { validasiTransaksi } from "@/lib/transaksi-input";
import type { Transaction } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catat transaksi dari form "Isi manual". Lewat server, bukan insert langsung
 * dari browser, supaya baris rekening koran untuk transaksi yang sama ikut
 * disingkirkan seperti pada foto struk.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Isiannya nggak kebaca." }, { status: 400 });
  }

  const hasil = validasiTransaksi(body as Record<string, unknown>);
  if (!hasil.ok) {
    return NextResponse.json({ error: hasil.error }, { status: 400 });
  }

  try {
    const { transaction } = await insertFromImage(supabase, user.id, {
      ...hasil.data,
      user_id: user.id,
      // Diisi sendiri oleh pemiliknya, jadi nominalnya sudah bisa dipercaya.
      status: "confirmed",
      raw_ocr_text: null,
      source: "text",
    });
    return NextResponse.json({ transaction: transaction as Transaction }, { status: 201 });
  } catch (dbError) {
    return NextResponse.json({ error: dbErrorMessage(dbError) }, { status: 500 });
  }
}
