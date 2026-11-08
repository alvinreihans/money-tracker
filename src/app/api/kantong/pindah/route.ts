import { NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { GalatPindah, terapkanPindah } from "@/lib/pindah-server";

/**
 * Jadikan pindah kantong (SPEC-kantong-sendiri A-3). Body: { kantong_id, ids?: string[] }
 * (tanpa ids = semua calon). Calonnya dihitung ulang di server, lalu RPC jadikan_pindah.
 * Jawaban: { ok, n, salinan } — salinan dikirim ke /api/kantong/pindah/urungkan untuk Urungkan.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Sesi kamu udah abis. Masuk lagi ya." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { kantong_id?: unknown; ids?: unknown } | null;
  if (typeof body?.kantong_id !== "string") return NextResponse.json({ error: "Kantongnya belum dipilih." }, { status: 400 });
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : null;
  try {
    const { n, salinan } = await terapkanPindah(supabase, body.kantong_id, ids);
    return NextResponse.json({ ok: true, n, salinan });
  } catch (e) {
    if (e instanceof GalatPindah) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("jadikan pindah:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Gagal menjadikan pindah kantong. Coba lagi." }, { status: 500 });
  }
}
