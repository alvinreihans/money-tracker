import { NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thumbnail di "Cara dicatat" (SPEC-periksa-dulu K1). Didekripsi di database
 * (RPC foto_jejak) dan hanya untuk pemiliknya.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return new NextResponse(null, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("foto_jejak", { p_id: Number(id) });
  if (typeof data !== "string" || !data) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(data, "base64")), {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=300" },
  });
}
