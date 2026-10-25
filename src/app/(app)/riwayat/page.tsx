import { isoLokal } from "@/lib/format";
import { ambilKategori } from "@/lib/kategori-server";
import { bacaFilter, infoPecahan, PER_MUAT, queryRiwayat, ringkasRiwayat } from "@/lib/riwayat";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import RiwayatView from "./RiwayatView";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

export default async function RiwayatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createSupabaseServerClient();
  const [p, { data: kantong }, kategori] = await Promise.all([
    searchParams,
    supabase.from("user_accounts").select("id"),
    ambilKategori(supabase),
  ]);
  // Filter dari URL hanya memuat kantong & kategori milik user ini.
  const filter = bacaFilter(p, {
    kantong: (kantong ?? []).map((k) => k.id as string),
    kategori: kategori.map((k) => `${k.type}:${k.slug}`),
  });
  const hariIni = isoLokal(new Date());

  // Total untuk SELURUH hasil filter (bukan hanya 100 yang dimuat), per 1.000
  // baris karena batas PostgREST — sama seperti ekspor.
  // ponytail: dijumlah di server dari semua baris; pindahkan ke RPC SQL kalau riwayat sudah puluhan ribu baris.
  const [{ data, count }, barisTotal] = await Promise.all([
    queryRiwayat(supabase, filter, hariIni).range(0, PER_MUAT - 1),
    (async () => {
      const semua: { amount: number | string; type: string; transaction_date: string }[] = [];
      for (let dari = 0; ; dari += 1000) {
        const { data: d } = await queryRiwayat(supabase, filter, hariIni, "amount, type, transaction_date").range(dari, dari + 999);
        semua.push(...((d ?? []) as unknown as typeof semua));
        if (!d || d.length < 1000) return semua;
      }
    })(),
  ]);

  return (
    <RiwayatView
      filter={filter}
      total={count ?? data?.length ?? 0}
      ringkasan={ringkasRiwayat(barisTotal)}
      daftar={(data ?? []) as unknown as Transaction[]}
      // Transaksi yang dipecah tampil satu kartu dengan totalnya (SPEC-metode-budget).
      pecahan={await infoPecahan(supabase, (data ?? []) as unknown as Transaction[])}
    />
  );
}
