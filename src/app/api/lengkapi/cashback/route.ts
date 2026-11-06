import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { buatKantongDompet, catatCashback } from "@/lib/lengkapi-server";
import { kantongCashback } from "@/lib/lengkapi";
import type { Transaction } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Cashback yang tertunda di ringkasan unggah banyak karena kantong e-wallet-nya
 * belum ada (SPEC-lengkapi K4): kantongnya dibuat, lalu cashback dicatat
 * sebagai ikutan transaksinya masing-masing.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { dompet?: unknown; items?: unknown } | null;
  const dompet = typeof b?.dompet === "string" && b.dompet.trim() ? b.dompet.trim().slice(0, 40) : null;
  const items = Array.isArray(b?.items)
    ? (b.items as { id?: unknown; nominal?: unknown }[]).filter((x) => typeof x.id === "string" && UUID.test(x.id) && Number(x.nominal) > 0).slice(0, 50)
    : [];
  if (!dompet || !items.length) return NextResponse.json({ error: "Tidak ada cashback yang dicatat." }, { status: 400 });

  const { data: akun } = await supabase.from("user_accounts").select("id, name, kind, aliases, macam_simpanan, saldo_per, saldo_sejak");
  const k = kantongCashback(dompet, (akun ?? []) as Parameters<typeof kantongCashback>[1]) ?? (await buatKantongDompet(supabase, user.id, dompet));
  if (!k) return NextResponse.json({ error: `Gagal membuat kantong ${dompet}.` }, { status: 500 });
  let n = 0;
  for (const x of items) {
    const id = x.id as string;
    const [{ data: induk }, { count }] = await Promise.all([
      supabase.from("transactions").select("*").eq("id", id).maybeSingle(),
      supabase.from("transactions").select("id", { count: "exact", head: true }).eq("induk_id", id).eq("type", "income"),
    ]);
    if (!induk || (induk as Transaction).type !== "expense" || count) continue;
    if (await catatCashback(supabase, user.id, induk as Transaction, Number(x.nominal), k.id)) n++;
  }
  return NextResponse.json({ kantong: k.name, dicatat: n });
}
