import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { kirimPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notifikasi konfirmasi setelah sakelar Notifikasi dinyalakan, lewat jalur
 * yang sama dengan cron — jadi kalau ini sampai, pengingat harian juga sampai.
 * Hanya ke langganan milik user yang sedang login (RLS).
 */
export async function POST(req: NextRequest) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Endpoint kosong." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("push_langganan").select("endpoint, p256dh, auth").eq("endpoint", body.endpoint);
  if (!data?.length) return NextResponse.json({ error: "Langganan tidak ditemukan." }, { status: 404 });

  const r = await kirimPush(
    data,
    [{ judul: "Notifikasi nyala", isi: "Pengingat jatuh tempo & catat dikirim tiap jam 19.00.", url: "/profil", tag: "uji" }],
    new URL(req.url).origin,
  );
  if (r.mati.length) await supabase.from("push_langganan").delete().in("endpoint", r.mati);
  return NextResponse.json(r, { status: r.terkirim ? 200 : 502 });
}
