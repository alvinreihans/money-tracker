import { NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thumbnail struk sebuah catatan yang belum selesai. Didekripsi di database
 * (RPC foto_draft) dan hanya untuk pemiliknya.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("foto_draft", { p_id: id });
  if (typeof data !== "string" || !data) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(Buffer.from(data, "base64")), {
    headers: {
      "content-type": "image/webp",
      // Data pribadi: hanya di browser pemiliknya, sebentar.
      "cache-control": "private, max-age=300",
    },
  });
}
