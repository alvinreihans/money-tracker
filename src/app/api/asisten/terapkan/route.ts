import { NextResponse } from "next/server";
import { GalatAksi, terapkanAksi } from "@/lib/aksi-server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Terapkan kartu usulan Tanya AI (SPEC-asisten-agen §3). Body: { isian, kantong }
 * dari usulan_aksi di jawaban /api/tanya. RPC terapkan_usulan memeriksa ulang
 * semuanya dalam satu transaksi database. Balasan: { aksi_id, n, saldo }.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Sesi kamu udah abis. Masuk lagi ya." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { isian?: unknown; kantong?: unknown } | null;
  try {
    return NextResponse.json(await terapkanAksi(await createSupabaseServerClient(), body?.isian, body?.kantong));
  } catch (e) {
    if (e instanceof GalatAksi) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("terapkan usulan:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Gagal menerapkan. Coba lagi." }, { status: 500 });
  }
}
