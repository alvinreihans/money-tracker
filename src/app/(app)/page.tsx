import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hitungStreak, pisahTujuan, progresBudget } from "@/lib/analitik";
import { ambilPengaturanMetode, hitungMetode } from "@/lib/metode";
import { infoPecahan } from "@/lib/riwayat";
import { isoLokal } from "@/lib/format";
import { ambilKantong } from "@/lib/kantong";
import { kantongUang, ringkasBeranda, type Cicilan } from "@/lib/pinjaman";
import { rentangBulan } from "@/lib/periode";
import BerandaView from "./BerandaView";
import type { Transaction } from "@/types/transaction";

export const dynamic = "force-dynamic";

// ponytail: streak dihitung dari catatan 90 hari terakhir; lebih dari itu
// tetap tampil "90 hari". Pindahkan ke RPC kalau ada yang betah selama itu.
const HARI_STREAK = 90;
const BERANDA_TERBARU = 5;

export default async function BerandaPage({ searchParams }: { searchParams: Promise<{ catat?: string }> }) {
  // ?catat=<id> dari push "catatan belum selesai": langsung buka percakapannya.
  const { catat } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const sekarang = new Date();
  const { awalBulanIni, awalBulanLalu } = rentangBulan(sekarang);
  const hariIni = isoLokal(sekarang);

  const jumlahkan = (rows: { amount: number | string }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  // Transfer dikecualikan di semua hitungan: itu uang pindah kantong sendiri,
  // bukan pengeluaran maupun pemasukan.
  const [
    { data: terbaru },
    { data: keluarIni },
    { data: keluarLalu },
    { count: draft },
    { data: catatan },
    { data: budgets },
    { kantong, saldo },
    { data: cicilan },
    { data: bayarCicilan },
    pengaturan,
  ] = await Promise.all([
    // Beranda cuma 5 transaksi terakhir (urutan sama dengan Riwayat);
    // selebihnya di Riwayat. Yang belum selesai tidak di sini — ada di lembar Catat.
    supabase
      .from("transactions")
      .select("*")
      .eq("status", "confirmed")
      .order("transaction_date", { ascending: false })
      .order("waktu", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("induk_id", { ascending: true, nullsFirst: true })
      .limit(BERANDA_TERBARU),
    supabase
      .from("transactions")
      .select("amount, category, type, kelompok_efektif, kantong_id")
      .eq("type", "expense")
      .eq("status", "confirmed")
      .gte("transaction_date", awalBulanIni),
    supabase
      .from("transactions")
      .select("amount, type, kantong_id")
      .eq("type", "expense")
      .eq("status", "confirmed")
      .gte("transaction_date", awalBulanLalu)
      .lt("transaction_date", awalBulanIni),
    supabase.from("draft_catat").select("transaksi_id", { count: "exact", head: true }),
    supabase
      .from("transactions")
      .select("created_at")
      .gte("created_at", new Date(sekarang.getTime() - HARI_STREAK * 86_400_000).toISOString()),
    supabase.from("budgets").select("category, amount"),
    ambilKantong(supabase),
    supabase.from("cicilan").select("id, nama, tenor, jatuh_tempo_awal, nominal"),
    supabase.from("transactions").select("cicilan_id, cicilan_ke").not("cicilan_id", "is", null),
    // Metode budgeting (SPEC-metode-budget): peringatan per kelompok.
    ambilPengaturanMetode(supabase),
  ]);

  const dibayar: Record<string, number[]> = {};
  for (const b of (bayarCicilan ?? []) as { cicilan_id: string; cicilan_ke: number | null }[]) {
    if (b.cicilan_ke) (dibayar[b.cicilan_id] ??= []).push(b.cicilan_ke);
  }

  // Pembelian dari tujuan tabungan bukan pengeluaran bulan ini (SPEC-analitik-tujuan).
  const keluarBiasa = pisahTujuan(keluarIni ?? [], pengaturan.tujuan).biasa;
  const metode = hitungMetode(pengaturan, keluarIni ?? []);
  // Pay Yourself First & Zero-Based (SPEC-metode-lanjutan): setelah gajian,
  // ingatkan tabungan yang belum disisihkan sampai setorannya ≥ target.
  const tabungan = metode?.metode === "pyf" || metode?.metode === "zero-based" ? metode.wadah.find((w) => w.sumber === "setoran-total") : undefined;
  const sisihkan =
    tabungan && pengaturan.penghasilanBulanIni > 0 && tabungan.target > tabungan.realisasi
      ? { kurang: tabungan.target - tabungan.realisasi, tujuan: pengaturan.tujuan }
      : null;

  return (
    <BerandaView
      ringkasan={{
        keluar: jumlahkan(keluarBiasa),
        keluarBulanLalu: jumlahkan(pisahTujuan(keluarLalu ?? [], pengaturan.tujuan).biasa),
      }}
      draft={draft ?? 0}
      bukaCatat={catat}
      terbaru={(terbaru ?? []) as Transaction[]}
      pecahan={await infoPecahan(supabase, (terbaru ?? []) as Transaction[])}
      // Total aset hanya kantong uang (termasuk tujuan tabungan); orang & kartu kredit ada di Utang & Piutang.
      kantong={kantong.filter(kantongUang).map((k) => ({ id: k.id, name: k.name, kind: k.kind, emoji: k.emoji, saldo: saldo.get(k.id) ?? 0 }))}
      pinjaman={ringkasBeranda(
        kantong.map((k) => ({ ...k, saldo: saldo.get(k.id) ?? 0 })),
        (cicilan ?? []) as Cicilan[],
        dibayar,
        hariIni,
      )}
      budget={progresBudget(budgets ?? [], keluarBiasa)}
      metode={metode}
      sisihkan={sisihkan}
      streak={hitungStreak((catatan ?? []).map((c) => c.created_at as string), sekarang)}
    />
  );
}
