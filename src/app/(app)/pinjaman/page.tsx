import { isoLokal } from "@/lib/format";
import { ambilKantong } from "@/lib/kantong";
import type { Cicilan, StrategiUtang } from "@/lib/pinjaman";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import PinjamanView from "./PinjamanView";

export const dynamic = "force-dynamic";

export default async function PinjamanPage() {
  const supabase = await createSupabaseServerClient();
  const [user, { kantong, saldo }, { data: cicilan }, { data: bayar }, { data: strategi }] = await Promise.all([
    ambilUser(),
    ambilKantong(supabase),
    supabase.from("cicilan").select("*").order("created_at"),
    // Cicilan yang sudah dibayar: cukup nomornya per rencana.
    supabase.from("transactions").select("cicilan_id, cicilan_ke").not("cicilan_id", "is", null),
    // Strategi pelunasan (SPEC-pelunasan) tersimpan di baris metode_budget.
    supabase.from("metode_budget").select("strategi_utang, ekstra_utang").maybeSingle(),
  ]);

  const dibayar: Record<string, number[]> = {};
  for (const b of (bayar ?? []) as { cicilan_id: string; cicilan_ke: number | null }[]) {
    if (b.cicilan_ke) (dibayar[b.cicilan_id] ??= []).push(b.cicilan_ke);
  }

  return (
    <PinjamanView
      userId={user?.id ?? ""}
      hariIni={isoLokal(new Date())}
      kantong={kantong.map((k) => ({ ...k, saldo: saldo.get(k.id) ?? 0 }))}
      cicilan={(cicilan ?? []) as Cicilan[]}
      dibayar={dibayar}
      strategi={(strategi?.strategi_utang as StrategiUtang | null) ?? null}
      ekstra={Number(strategi?.ekstra_utang) > 0 ? Number(strategi!.ekstra_utang) : null}
    />
  );
}
