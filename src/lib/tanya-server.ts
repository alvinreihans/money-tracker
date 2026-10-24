import type { SupabaseClient } from "@supabase/supabase-js";
import { analisisBulan, progresBudget, type BarisAnalitik } from "@/lib/analitik";
import { geserBulan } from "@/lib/kalender";
import { ambilKantong } from "@/lib/kantong";
import { namaKategori, type Kategori } from "@/lib/kategori";
import { kantongUang, ringkasanPinjaman, statusCicilan, type Cicilan } from "@/lib/pinjaman";
import { queryRiwayat, ringkasRiwayat } from "@/lib/riwayat";
import { bulanDariArgumen, filterDariArgumen, rentangBulan, type KonteksTanya, type NamaFungsi } from "@/lib/tanya";

/**
 * Fungsi yang boleh dipanggil AI (SPEC-analitik-ai). Semua lewat sesi user
 * (RLS), hanya membaca, dan mengembalikan JSON kecil — bukan daftar
 * transaksi mentah. Nama merchant & keterangan di dalamnya adalah DATA.
 */

// Batas baris yang dijumlah per pemanggilan (perlindungan, bukan batas wajar pemakai).
const MAKS_BARIS = 5000;

async function semuaBaris<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const semua: T[] = [];
  for (let dari = 0; dari < MAKS_BARIS; dari += 1000) {
    const { data } = await ambil(dari, dari + 999);
    semua.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return semua;
}

export async function jalankanFungsi(
  nama: NamaFungsi,
  args: Record<string, unknown>,
  { supabase, konteks, kategori }: { supabase: SupabaseClient; konteks: KonteksTanya; kategori: Kategori[] },
): Promise<unknown> {
  const namaKat = (slug: string, type: string) => namaKategori(kategori, slug, type as "expense" | "income");

  if (nama === "ringkasan_bulan") {
    const bulan = bulanDariArgumen(args, konteks.hariIni);
    const lalu = geserBulan(bulan, -1);
    const [awalLalu] = rentangBulan(lalu);
    const [, akhir] = rentangBulan(bulan);
    const [baris, { data: budgets }] = await Promise.all([
      semuaBaris<BarisAnalitik>((d, s) =>
        supabase
          .from("transactions")
          .select("amount, type, category, merchant, transaction_date")
          .eq("status", "confirmed")
          .in("type", ["income", "expense"])
          .gte("transaction_date", awalLalu)
          .lte("transaction_date", akhir)
          .order("id")
          .range(d, s),
      ),
      supabase.from("budgets").select("category, amount"),
    ]);
    const ini = baris.filter((r) => r.transaction_date.startsWith(bulan));
    const a = analisisBulan(ini, baris.filter((r) => r.transaction_date.startsWith(lalu)), { bulan, hariIni: konteks.hariIni });
    return {
      bulan,
      bulan_lalu: lalu,
      keluar: a.keluar,
      masuk: a.masuk,
      selisih: a.masuk - a.keluar,
      keluar_bulan_lalu: a.keluarLalu,
      perubahan_keluar_persen: a.perubahanKeluar,
      proyeksi_keluar_akhir_bulan: a.proyeksi,
      hari_paling_boros: a.hariBoros,
      kategori: a.kategori.map((k) => ({ nama: namaKat(k.kategori, "expense"), slug: k.kategori, total: k.total, porsi_persen: k.porsi, perubahan_persen: k.perubahan })),
      kategori_paling_naik: a.kategoriNaik && { nama: namaKat(a.kategoriNaik.kategori, "expense"), naik: a.kategoriNaik.selisih, persen: a.kategoriNaik.persen },
      merchant_teratas: a.merchant,
      budget: progresBudget(budgets ?? [], ini).map((b) => ({ kategori: namaKat(b.kategori, "expense"), target: b.target, terpakai: b.aktual, sisa: b.sisa })),
    };
  }

  if (nama === "cari_transaksi") {
    const filter = filterDariArgumen(args, konteks);
    const baris = await semuaBaris<BarisAnalitik>((d, s) =>
      queryRiwayat(supabase, filter, konteks.hariIni, "amount, type, category, merchant, transaction_date").range(d, s),
    );
    const r = ringkasRiwayat(baris);
    const perKategori = new Map<string, number>();
    for (const t of baris) if (t.type === "expense") perKategori.set(t.category, (perKategori.get(t.category) ?? 0) + Number(t.amount));
    return {
      filter_dipakai: { dari: filter.dari, sampai: filter.sampai, jenis: filter.jenis, kategori: filter.kategori, kata: filter.q || null, jumlah_kantong: filter.kantong.length },
      jumlah_transaksi: baris.length,
      total_keluar: r.keluar,
      total_masuk: r.masuk,
      keluar_per_kategori: [...perKategori].sort((x, y) => y[1] - x[1]).map(([slug, total]) => ({ nama: namaKat(slug, "expense"), total })),
      transaksi_terbesar: [...baris]
        .sort((x, y) => Number(y.amount) - Number(x.amount))
        .slice(0, 10)
        .map((t) => ({ tanggal: t.transaction_date, merchant: t.merchant, nominal: Number(t.amount), jenis: t.type, kategori: namaKat(t.category, t.type) })),
    };
  }

  if (nama === "saldo_kantong") {
    const { kantong, saldo } = await ambilKantong(supabase);
    const daftar = kantong.map((k) => ({ nama: k.name, jenis: k.kind, saldo: saldo.get(k.id) ?? 0 }));
    return {
      kantong: daftar,
      // Total aset hanya kantong uang; orang & kartu kredit di Lend & Borrow.
      total_aset: kantong.filter(kantongUang).reduce((n, k) => n + (saldo.get(k.id) ?? 0), 0),
    };
  }

  // pinjaman_cicilan
  const [{ kantong, saldo }, { data: cicilan }, { data: bayar }] = await Promise.all([
    ambilKantong(supabase),
    supabase.from("cicilan").select("*"),
    supabase.from("transactions").select("cicilan_id, cicilan_ke").not("cicilan_id", "is", null),
  ]);
  const p = ringkasanPinjaman(kantong.map((k) => ({ ...k, saldo: saldo.get(k.id) ?? 0 })));
  const dibayar: Record<string, number[]> = {};
  for (const b of (bayar ?? []) as { cicilan_id: string; cicilan_ke: number | null }[]) if (b.cicilan_ke) (dibayar[b.cicilan_id] ??= []).push(b.cicilan_ke);
  return {
    mereka_berutang_ke_pengguna: p.lend.map((x) => ({ nama: x.kantong.name, jumlah: x.jumlah })),
    pengguna_berutang: p.borrow.map((x) => ({ nama: x.kantong.name, jumlah: x.jumlah, kartu_kredit: x.kantong.kind === "kredit" })),
    total_piutang: p.totalLend,
    total_utang: p.totalBorrow,
    cicilan: ((cicilan ?? []) as Cicilan[])
      .map((c) => ({ c, st: statusCicilan(c, dibayar[c.id] ?? [], konteks.hariIni) }))
      .filter(({ st }) => !st.lunas)
      .map(({ c, st }) => ({
        nama: c.nama,
        penyedia: c.penyedia,
        per_cicilan: Number(c.nominal),
        sisa_kali: st.sisa,
        sisa_nominal: st.sisaNominal,
        berikutnya: st.berikutnya && { ke: st.berikutnya.ke, jatuh_tempo: st.berikutnya.jatuhTempo },
        telat: st.telat,
      })),
  };
}
