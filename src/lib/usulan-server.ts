import type { SupabaseClient } from "@supabase/supabase-js";
import { saringTransaksi } from "@/lib/alat-server";
import { ambilKantong } from "@/lib/kantong";
import type { Kategori } from "@/lib/kategori";
import { geserHari } from "@/lib/format";
import { bersihkanArgCari, idDariArgumen, type KonteksTanya } from "@/lib/tanya";
import {
  cariKantongUsulan,
  idsDariArgumen,
  MAKS_USULAN,
  usulBuatKantong,
  usulCatat,
  usulHapus,
  usulJadikanPindah,
  usulSelesaikanDraft,
  usulUbahTransaksi,
  type HasilUsulan,
  type KonteksUsulan,
  type TxUsulan,
  type UsulanAksi,
} from "@/lib/usulan";

/**
 * Pemuat data alat usul_* (SPEC-asisten-agen §3) lewat sesi user (RLS). Tidak
 * menulis apa pun: hasilnya usulan yang ditampilkan browser sebagai kartu.
 * Penerapannya lewat /api/asisten/terapkan → RPC terapkan_usulan.
 */

export const NAMA_USUL = ["usul_buat_kantong", "usul_jadikan_pindah", "usul_ubah_transaksi", "usul_hapus", "usul_selesaikan_draft", "usul_catat"] as const;
export type NamaUsul = (typeof NAMA_USUL)[number];
export const alatUsul = (nama: string): nama is NamaUsul => (NAMA_USUL as readonly string[]).includes(nama);

const KOLOM =
  "id, amount, type, status, source, merchant, description, category, kantong_id, kantong_tujuan_id, transaction_date, waktu, created_at, updated_at, ref_bank, ref_bank_tujuan, induk_id, cicilan_id, pecahan_dari, perlu_dilengkapi";

interface Ctx {
  supabase: SupabaseClient;
  konteks: KonteksTanya;
  kategori: Kategori[];
  /** Pertanyaan user (untuk "Cara dicatat" usul_catat). */
  pertanyaan: string;
}

/** Transaksi yang dipilih AI: `ids` (dari hasil cari) atau `saring` (seperti cari). Paling banyak MAKS_USULAN + 1 (tanda ada sisa). */
async function pilihTransaksi(supabase: SupabaseClient, args: Record<string, unknown>, konteks: KonteksTanya): Promise<{ baris: TxUsulan[] } | { error: Record<string, unknown> }> {
  const ids = idsDariArgumen(args.ids);
  if (ids.length) {
    const { data, error } = await supabase.from("transactions").select(KOLOM).in("id", ids);
    if (error) throw new Error(`usulan: ${error.message}`);
    return { baris: (data ?? []) as TxUsulan[] };
  }
  if (!args.saring || typeof args.saring !== "object") return { error: { error: "Sebut transaksinya: ids (dari hasil cari) atau saring." } };
  const c = bersihkanArgCari({ sumber: "transaksi", saring: args.saring }, konteks);
  if (c.kantongTakDikenal.length && !c.kantong.length) return { error: { error: "Kantong di saringan tidak dikenal.", kantong_tidak_dikenal: c.kantongTakDikenal, kantong_yang_ada: konteks.kantong.map((k) => k.name) } };
  const kosong = !c.dari && !c.sampai && !c.kantong.length && !c.kategori.length && !c.kata && !c.jenis && !c.asal.length && c.minimal == null && c.maksimal == null && c.refBank == null && c.status === "semua";
  if (kosong) return { error: { error: "Saringan terlalu luas (semua transaksi). Persempit dengan tanggal, kata, kantong, atau kategori." } };
  const { data, error } = await saringTransaksi(supabase.from("transactions").select(KOLOM), c)
    .order("transaction_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAKS_USULAN + 1);
  if (error) throw new Error(`usulan: ${error.message}`);
  return { baris: (data ?? []) as TxUsulan[] };
}

export async function jalankanUsul(nama: NamaUsul, args: Record<string, unknown>, { supabase, konteks, kategori, pertanyaan }: Ctx): Promise<HasilUsulan> {
  const { kantong, saldo } = await ambilKantong(supabase);
  const k: KonteksUsulan = { hariIni: konteks.hariIni, kantong, saldo, kategori: kategori.map((c) => ({ type: c.type, slug: c.slug, name: c.name })) };

  if (nama === "usul_buat_kantong") return usulBuatKantong(args, k);
  if (nama === "usul_catat") return usulCatat(args, k, pertanyaan);
  if (nama === "usul_selesaikan_draft") {
    const id = idDariArgumen(args);
    const { data } = id ? await supabase.from("transactions").select(KOLOM).eq("id", id).maybeSingle() : { data: null };
    return usulSelesaikanDraft((data as TxUsulan | null) ?? null, args, k);
  }

  const pilih = await pilihTransaksi(supabase, args, konteks);
  if ("error" in pilih) return { untukModel: pilih.error };
  const baris = pilih.baris;

  if (nama === "usul_ubah_transaksi") return usulUbahTransaksi(baris, args, k);

  if (nama === "usul_jadikan_pindah") {
    // Calon sisi lain di kantong tujuan (±1 hari dari rentang yang dipilih).
    let lawan: TxUsulan[] = [];
    const tanggal = baris.map((t) => t.transaction_date).sort();
    const keId = cariKantongUsulan(args.ke_kantong, k, true)?.id;
    if (keId && tanggal.length) {
      const { data } = await supabase
        .from("transactions")
        .select(KOLOM)
        .eq("kantong_id", keId)
        .eq("status", "confirmed")
        .in("type", ["expense", "income"])
        .gte("transaction_date", geserHari(tanggal[0], -1))
        .lte("transaction_date", geserHari(tanggal.at(-1)!, 1))
        .limit(2000);
      lawan = (data ?? []) as TxUsulan[];
    }
    return usulJadikanPindah(baris, lawan, args, k);
  }

  // usul_hapus: kembaran di kantong & sekitar tanggal yang sama, dan yang punya pecahan.
  const tanggal = baris.map((t) => t.transaction_date).sort();
  const kantongIds = [...new Set(baris.map((t) => t.kantong_id).filter((x): x is string => Boolean(x)))];
  const [sekitar, pecahan] = await Promise.all([
    kantongIds.length && tanggal.length
      ? supabase
          .from("transactions")
          .select(KOLOM)
          .in("kantong_id", kantongIds)
          .eq("status", "confirmed")
          .gte("transaction_date", geserHari(tanggal[0], -1))
          .lte("transaction_date", geserHari(tanggal.at(-1)!, 1))
          .limit(3000)
      : Promise.resolve({ data: [] }),
    baris.length ? supabase.from("transactions").select("pecahan_dari").in("pecahan_dari", baris.map((t) => t.id)) : Promise.resolve({ data: [] }),
  ]);
  return usulHapus(baris, (sekitar.data ?? []) as TxUsulan[], new Set(((pecahan.data ?? []) as { pecahan_dari: string }[]).map((x) => x.pecahan_dari)), k);
}

export type { UsulanAksi };
