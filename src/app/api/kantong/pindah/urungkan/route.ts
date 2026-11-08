import { NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { GalatPindah, urungkanPindah } from "@/lib/pindah-server";

/**
 * Urungkan "Jadikan pindah" (SPEC-kantong-sendiri A-3). Body: { salinan } dari
 * /api/kantong/pindah. RPC urungkan_jadikan_pindah (RLS: hanya milik sendiri).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Sesi kamu udah abis. Masuk lagi ya." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { salinan?: unknown } | null;
  if (!Array.isArray(body?.salinan) || !body.salinan.length) return NextResponse.json({ error: "Tidak ada yang diurungkan." }, { status: 400 });
  try {
    const n = await urungkanPindah(supabase, body.salinan.slice(0, 500));
    return NextResponse.json({ ok: true, n });
  } catch (e) {
    if (e instanceof GalatPindah) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("urungkan pindah:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Gagal mengurungkan. Coba lagi." }, { status: 500 });
  }
}
