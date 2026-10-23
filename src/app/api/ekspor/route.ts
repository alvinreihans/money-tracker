import { NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { KOLOM_EKSPOR, keCsv, tabelEkspor, type BarisEkspor } from "@/lib/ekspor";
import { hariWIB } from "@/lib/notifikasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unduh semua transaksi milik user sebagai CSV (Pengaturan → Ekspor data).
 * Lewat sesi user, jadi view transactions sudah mendekripsi teksnya dan
 * hanya baris miliknya yang ikut.
 */
export async function GET() {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const [{ data: kantong }, { data: kategori }] = await Promise.all([
    supabase.from("user_accounts").select("id, name"),
    supabase.from("categories").select("type, slug, name"),
  ]);

  // PostgREST membatasi 1000 baris per permintaan; cadangan yang terpotong
  // diam-diam lebih buruk daripada beberapa permintaan tambahan.
  const transaksi: BarisEkspor[] = [];
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await supabase
      .from("transactions")
      .select(KOLOM_EKSPOR)
      .order("transaction_date")
      .order("waktu")
      .order("created_at")
      .order("id")
      .range(dari, dari + 999);
    if (error) return NextResponse.json({ error: "Gagal mengambil transaksi." }, { status: 500 });
    transaksi.push(...(data as BarisEkspor[]));
    if (data.length < 1000) break;
  }

  return new Response(keCsv(tabelEkspor(transaksi, kantong ?? [], kategori ?? [])), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="money-tracker-${hariWIB(new Date())}.csv"`,
      "cache-control": "no-store",
    },
  });
}
