import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { kandidatDraft } from "@/lib/lengkapi-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Transaksi tercatat yang mungkin pasangan sebuah draft "sudah tercatat?" (SPEC-lengkapi §4). */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const draft = req.nextUrl.searchParams.get("draft") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(draft)) return NextResponse.json({ kandidat: [] });
  return NextResponse.json({ kandidat: await kandidatDraft(supabase, draft) });
}
