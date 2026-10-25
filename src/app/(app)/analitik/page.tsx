import { ambilPengaturanMetode, hitungMetode } from "@/lib/metode";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { analisisBulan, progresBudget, trenBulanan, type BarisAnalitik } from "@/lib/analitik";
import { geserHari, isoLokal } from "@/lib/format";
import { geserBulan } from "@/lib/kalender";
import AnalitikView from "./AnalitikView";

export const dynamic = "force-dynamic";

const BULAN_TREN = 6;

/**
 * Tab Analitik (SPEC-analitik-insight): satu bulan pilihan (?bulan=YYYY-MM,
 * bawaan bulan berjalan) dibanding bulan sebelumnya, plus tren 6 bulan yang
 * berakhir di bulan itu.
 */
export default async function AnalitikPage({ searchParams }: { searchParams: Promise<{ bulan?: string | string[] }> }) {
  const supabase = await createSupabaseServerClient();
  const hariIni = isoLokal(new Date());
  const bulanIni = hariIni.slice(0, 7);
  const { bulan: diminta } = await searchParams;
  // Masukan URL: harus "YYYY-MM" yang sah dan tidak melewati bulan berjalan.
  const bulan = typeof diminta === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(diminta) && diminta <= bulanIni ? diminta : bulanIni;
  const awalTren = `${geserBulan(bulan, -(BULAN_TREN - 1))}-01`;
  const akhir = geserHari(`${geserBulan(bulan, 1)}-01`, -1);

  // Transfer dikecualikan di semua hitungan: itu uang pindah kantong sendiri.
  // ponytail: semua baris 6 bulan dijumlah di server; pindahkan ke RPC SQL kalau sebulan sudah ribuan transaksi.
  const [baris, { data: budgets }, pengaturan] = await Promise.all([
    (async () => {
      const semua: BarisAnalitik[] = [];
      for (let dari = 0; ; dari += 1000) {
        const { data } = await supabase
          .from("transactions")
          .select("amount, type, category, merchant, transaction_date, kelompok_efektif, kantong_id")
          .eq("status", "confirmed")
          .in("type", ["income", "expense"])
          .gte("transaction_date", awalTren)
          .lte("transaction_date", akhir)
          .order("id")
          .range(dari, dari + 999);
        semua.push(...((data ?? []) as BarisAnalitik[]));
        if (!data || data.length < 1000) return semua;
      }
    })(),
    supabase.from("budgets").select("category, amount"),
    ambilPengaturanMetode(supabase, bulan),
  ]);

  const lalu = geserBulan(bulan, -1);
  const barisIni = baris.filter((r) => r.transaction_date.startsWith(bulan));
  const barisLalu = baris.filter((r) => r.transaction_date.startsWith(lalu));

  return (
    <AnalitikView
      bulan={bulan}
      bulanIni={bulanIni}
      analisis={analisisBulan(barisIni, barisLalu, { bulan, hariIni })}
      // Tanggal di tengah bulan pilihan: trenBulanan berakhir di bulan itu.
      tren={trenBulanan(baris, new Date(`${bulan}-15T12:00:00+07:00`), BULAN_TREN)}
      budget={progresBudget(budgets ?? [], barisIni)}
      totalBudget={(budgets ?? []).reduce((n, b) => n + Number(b.amount), 0)}
      // Metode budgeting (SPEC-metode-budget): null = budget per kategori.
      metode={hitungMetode(pengaturan, barisIni)}
    />
  );
}
