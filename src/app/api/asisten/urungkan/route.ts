import { NextResponse } from "next/server";
import { GalatAksi, urungkanAksi } from "@/lib/aksi-server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Urungkan kartu usulan yang sudah diterapkan (SPEC-asisten-agen §3, P6: tanpa
 * batas waktu, selama transaksinya belum diubah lagi). Body: { aksi_id, kantong }.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Sesi kamu udah abis. Masuk lagi ya." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { aksi_id?: unknown; kantong?: unknown } | null;
  try {
    return NextResponse.json(await urungkanAksi(await createSupabaseServerClient(), body?.aksi_id, body?.kantong));
  } catch (e) {
    if (e instanceof GalatAksi) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("urungkan usulan:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Gagal mengurungkan. Coba lagi." }, { status: 500 });
  }
}
