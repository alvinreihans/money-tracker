import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hitungStreak, pisahTujuan, progresBudget } from "@/lib/analitik";
import { ambilPengaturanMetode, hitungMetode } from "@/lib/metode";
import { awalKelompokWaktu, infoPecahan, totalKelompokWaktu } from "@/lib/riwayat";
import { isoLokal } from "@/lib/format";
import { ambilKantong } from "@/lib/kantong";
import { kantongUang, ringkasBeranda, type Cicilan } from "@/lib/pinjaman";
import { rentangBulan } from "@/lib/periode";
import { ambilDeposito, infoDeposito, susunKantong } from "@/lib/simpanan";
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
    { deposito, periode },
  ] = await Promise.all([
    // Beranda cuma 5 transaksi terakhir (urutan sama dengan Riwayat);
    // selebihnya di Riwayat. Yang belum selesai tidak di sini — ada di lembar Catat.
    // Dihitung per transaksi: bagian pecahan diambil terpisah di bawah.
    supabase
      .from("transactions")
      .select("*")
      .eq("status", "confirmed")
      .is("pecahan_dari", null)
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
    supabase.from("transactions").select("cicilan_id, cicilan_ke").not("cicilan_id", "is", null).eq("status", "confirmed"),
    // Metode budgeting (SPEC-metode-budget): peringatan per kelompok.
    ambilPengaturanMetode(supabase),
    // Simpanan (SPEC-simpanan): deposito selesai disembunyikan, yang jatuh tempo menunggu dicek.
    ambilDeposito(supabase),
  ]);

  // Bagian pecahan kelima transaksi itu (satu kartu per transaksi), dan total
  // pengeluaran sebenarnya per kelompok waktu ("Hari ini", "Minggu ini", …)
  // untuk header — bukan hanya dari kartu yang tampil (SPEC-navigasi).
  const asli = (terbaru ?? []) as Transaction[];
  const terlama = asli.at(-1)?.transaction_date;
  const [{ data: bagian }, keluarKelompok] = await Promise.all([
    asli.length
      ? supabase.from("transactions").select("*").in("pecahan_dari", asli.map((t) => t.id))
      : Promise.resolve({ data: [] as Transaction[] }),
    (async () => {
      const semua: { amount: number | string; transaction_date: string }[] = [];
      if (!terlama) return semua;
      for (let dari = 0; ; dari += 1000) {
        const { data: d } = await supabase
          .from("transactions")
          .select("amount, transaction_date")
          .eq("type", "expense")
          .eq("status", "confirmed")
          .gte("transaction_date", awalKelompokWaktu(terlama, sekarang))
          .order("id")
          .range(dari, dari + 999);
        semua.push(...(d ?? []));
        if (!d || d.length < 1000) return semua;
      }
    })(),
  ]);
  const terbaruLengkap = [...asli, ...((bagian ?? []) as Transaction[])];

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
      terbaru={terbaruLengkap}
      pecahan={await infoPecahan(supabase, asli)}
      totalKelompok={totalKelompokWaktu(keluarKelompok, sekarang)}
      // Total aset hanya kantong uang (termasuk tujuan tabungan); orang & kartu kredit ada di Utang & Piutang.
      // Simpanan & tujuan yang disimpan di kantong lain tidak dipisah: digabung ke induknya (SPEC-simpanan).
      kantong={susunKantong(
        kantong.filter(kantongUang).map((k) => ({ ...k, saldo: saldo.get(k.id) ?? 0 })),
        new Set(deposito.filter((d) => d.selesai).map((d) => d.kantong_id)),
      ).map((b) => ({ id: b.k.id, name: b.k.name, kind: b.k.kind, emoji: b.k.emoji, saldo: b.saldo, rincian: b.rincian }))}
      deposito={infoDeposito(kantong, saldo, deposito, periode)}
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
