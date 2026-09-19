import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseStatement } from "@/lib/statement";
import { importStatement } from "@/lib/statement-import";
import type { UserAccount } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tiap halaman PDF = satu panggilan Groq. Statement 7 halaman ~20 detik.
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const accountOverride = formData.get("account");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Field 'file' (PDF rekening koran) wajib diisi." },
        { status: 400 },
      );
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Hanya menerima berkas PDF." },
        { status: 415 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Ukuran file melebihi 10 MB." },
        { status: 413 },
      );
    }

    // Daftar rekening milik user menentukan mana yang transfer internal.
    // Tanpa ini semua topup akan salah tercatat sebagai pengeluaran.
    const { data: accountRows } = await supabase
      .from("user_accounts")
      .select("id, user_id, name, kind, aliases")
      .eq("user_id", user.id);

    const accounts = (accountRows ?? []) as UserAccount[];

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseStatement(buffer, accounts);

    const result = await importStatement(
      supabase,
      user.id,
      parsed,
      accounts,
      typeof accountOverride === "string" && accountOverride
        ? accountOverride
        : undefined,
    );

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
