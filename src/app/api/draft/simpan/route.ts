import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { alasanTidakIkut } from "@/lib/draft";
import { GalatSimpan, muatSaldoDari, selesaikanDraft, type SebelumSimpan } from "@/lib/simpan-draft";
import type { Transaction } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * "Simpan semua (n)" (SPEC-periksa-dulu §2): menyimpan draft yang lengkap dan
 * tidak ditandai. Syaratnya diperiksa ulang per id di sini — yang masih ada
 * pertanyaannya, dugaan dobel, atau hasil AI-nya ragu dilewati.
 *
 * Body: { ids: string[] }. Balasan: { disimpan: { transaction, sebelum }[], dilewati: { id, alasan }[] }.
 */
export async function POST(req: NextRequest) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 50) : [];
  if (!ids.length) return NextResponse.json({ error: "Tidak ada catatan yang dipilih." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const [{ data }, saldoDari] = await Promise.all([
    supabase.from("transactions").select("*").in("id", ids).eq("status", "needs_review").is("induk_id", null),
    muatSaldoDari(supabase),
  ]);
  const per = new Map(((data ?? []) as Transaction[]).map((t) => [t.id, t]));
  const disimpan: { transaction: Transaction; sebelum: SebelumSimpan }[] = [];
  const dilewati: { id: string; alasan: string }[] = [];
  for (const id of ids) {
    const tx = per.get(id);
    if (!tx) {
      dilewati.push({ id, alasan: "hilang" });
      continue;
    }
    const alasan = alasanTidakIkut(tx, saldoDari);
    if (alasan) {
      dilewati.push({ id, alasan });
      continue;
    }
    try {
      disimpan.push(await selesaikanDraft(supabase, tx, "semua"));
    } catch (e) {
      dilewati.push({ id, alasan: e instanceof GalatSimpan ? "hilang" : "gagal" });
    }
  }
  return NextResponse.json({ disimpan, dilewati });
}
