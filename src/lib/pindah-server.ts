import type { SupabaseClient } from "@supabase/supabase-js";
import { cariCalonPindah, emojiJenis, isianJadikanPindah, kalimatCalonPindah, tebakJenisKantong, type CalonPindah, type KantongPindah, type TransaksiPindah } from "@/lib/pindah";
import { pesanGagalKantong, type JenisKantong } from "@/lib/kantong";
import { kantongBank, kantongNomor, tentukanArah } from "@/lib/arah";
import { fmtIDR, fmtTanggalPendek, geserHari } from "@/lib/format";
import { selisihHari } from "@/lib/rekening/teks";
import type { ExtractedReceipt } from "@/types/transaction";
import { namaDariMetadata } from "@/lib/nama-rekening";

/**
 * Jalur server penautan ulang (SPEC-kantong-sendiri A-3): calon pindah kantong
 * untuk satu kantong, dan menerapkannya lewat RPC jadikan_pindah. RLS
 * membatasi semuanya ke data user yang sedang masuk. Dipakai
 * /api/kantong/[id]/calon-pindah, /api/kantong/pindah, dan (nanti) asisten agen.
 */

const KOLOM = "id, amount, type, status, source, merchant, description, kantong_id, kantong_tujuan_id, transaction_date, waktu, updated_at, ref_bank_tujuan, induk_id, cicilan_id, pecahan_dari";
// ponytail: 3000 transaksi rekening koran terbaru; yang lebih lama tidak ditawarkan ditautkan ulang.
const BATAS = 3000;

export interface HasilCalon {
  kantong: KantongPindah;
  calon: CalonPindah[];
  /** "3 transaksi lama sepertinya pindah ke DANA. Jadikan pindah kantong?"; null bila tidak ada calon. */
  kalimat: string | null;
}

/** Calon pindah kantong untuk kantong uang `kantongId`; null bila kantongnya tidak ada / bukan kantong uang. */
export async function muatCalonPindah(supabase: SupabaseClient, kantongId: string): Promise<HasilCalon | null> {
  const [{ data: k }, { data: pengguna }] = await Promise.all([
    supabase.from("user_accounts").select("id, name, kind, aliases, nomor_akhir").eq("id", kantongId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const kantong = k as KantongPindah | null;
  if (!kantong || !["bank", "ewallet", "cash"].includes(kantong.kind)) return null;
  const dasar = () =>
    supabase.from("transactions").select(KOLOM).eq("status", "confirmed").in("type", ["expense", "income"]).is("kantong_tujuan_id", null).is("induk_id", null).is("cicilan_id", null);
  const [rek, lawan] = await Promise.all([
    dasar().eq("source", "statement").neq("kantong_id", kantongId).order("transaction_date", { ascending: false }).limit(BATAS),
    dasar().eq("kantong_id", kantongId).order("transaction_date", { ascending: false }).limit(BATAS),
  ]);
  if (rek.error) throw new Error(`calon pindah: ${rek.error.message}`);
  if (lawan.error) throw new Error(`calon pindah: ${lawan.error.message}`);
  const transaksi = [...((rek.data ?? []) as TransaksiPindah[]), ...((lawan.data ?? []) as TransaksiPindah[])];
  const calon = cariCalonPindah(kantong, transaksi, { namaUser: namaDariMetadata(pengguna?.user?.user_metadata) });
  return { kantong, calon, kalimat: calon.length ? kalimatCalonPindah(kantong.name, calon) : null };
}

export class GalatPindah extends Error {}

/**
 * Jadikan pindah kantong: calon dihitung ulang di server (isian klien hanya memilih id),
 * lalu RPC jadikan_pindah (atomik; gagal bila ada yang berubah sejak ditampilkan).
 * Mengembalikan salinan untuk Urungkan.
 */
export async function terapkanPindah(supabase: SupabaseClient, kantongId: string, ids: string[] | null): Promise<{ n: number; salinan: unknown[] }> {
  const hasil = await muatCalonPindah(supabase, kantongId);
  if (!hasil) throw new GalatPindah("Kantongnya tidak ditemukan.");
  const dipilih = ids ? hasil.calon.filter((c) => ids.includes(c.id)) : hasil.calon;
  if (!dipilih.length || (ids && dipilih.length !== new Set(ids).size)) throw new GalatPindah("Transaksinya sudah berubah sejak ditampilkan. Muat ulang dulu.");
  const { data, error } = await supabase.rpc("jadikan_pindah", { p: isianJadikanPindah(hasil.kantong, dipilih) });
  if (error) throw new GalatPindah(error.code === "22023" || error.code === "23505" ? error.message : "Gagal menjadikan pindah kantong. Coba lagi.");
  const d = data as { n: number; salinan: unknown[] };
  return { n: d.n, salinan: d.salinan };
}

/** Urungkan jadikan pindah dengan salinan dari terapkanPindah. */
export async function urungkanPindah(supabase: SupabaseClient, salinan: unknown[]): Promise<number> {
  const { data, error } = await supabase.rpc("urungkan_jadikan_pindah", { p: { salinan } });
  if (error) throw new GalatPindah(error.code === "22023" ? error.message : "Gagal mengurungkan. Coba lagi.");
  return (data as { n: number }).n;
}

/** Kolom kantong yang dikembalikan ke obrolan (pilihan kantong, CatatProvider). */
export const KOLOM_KANTONG_BARU = "id, name, kind, emoji, aliases, saldo_per, saldo_sejak, induk_id, macam_simpanan, nomor_akhir";

export interface KantongBaru {
  id: string;
  name: string;
  kind: JenisKantong;
  emoji: string | null;
  aliases: string[] | null;
  saldo_per: string;
  saldo_sejak: string | null;
  induk_id: string | null;
  macam_simpanan: "tabungan" | "deposito" | null;
  nomor_akhir: string | null;
}

/**
 * Kantong yang dibuat di tempat dari obrolan (SPEC-kantong-sendiri A-1): jenis ditebak dari
 * namanya (tebakJenisKantong — paylater = kantong utang `kredit`), emoji bawaan jenisnya,
 * saldo Rp 0 sejak 00.00 WIB tanggal transaksinya (K1; sesudah obrolan ditanya saldonya),
 * `nomor_akhir` dari rekening tujuan yang terbaca (B-2). Nama yang sudah dipakai (beda huruf)
 * → kantong itu. `kantong` di Galat = pesan untuk user.
 */
export async function buatKantongDiTempat(
  supabase: SupabaseClient,
  userId: string,
  nama: string,
  opsi: { tanggal: string; nomor_akhir?: string | null },
): Promise<KantongBaru> {
  const name = nama.trim().slice(0, 40);
  if (!name) throw new GalatPindah("Nama kantongnya kosong.");
  const kind = tebakJenisKantong(name);
  const { data, error } = await supabase
    .from("user_accounts")
    .insert({
      user_id: userId,
      name,
      kind,
      emoji: emojiJenis(kind),
      saldo_awal: 0,
      saldo_per: opsi.tanggal,
      saldo_sejak: `${opsi.tanggal}T00:00:00+07:00`,
      // Saldo Rp 0 sementara (U1): rekening koran pertama banknya mengisi saldo awal, kecuali user mengisinya dulu.
      saldo_sementara: true,
      ...(opsi.nomor_akhir && /^\d{4}$/.test(opsi.nomor_akhir) && kind === "bank" ? { nomor_akhir: opsi.nomor_akhir } : {}),
    })
    .select(KOLOM_KANTONG_BARU)
    .single();
  if (!error) return data as KantongBaru;
  if (error.code === "23505") {
    const { data: ada } = await supabase.from("user_accounts").select(KOLOM_KANTONG_BARU).ilike("name", name).maybeSingle();
    if (ada) return ada as KantongBaru;
  }
  throw new GalatPindah(await pesanGagalKantong(supabase, error, name, null, "Gagal membuat kantongnya."));
}

/** Kartu "Jadikan pindah BRI → DANA" (SPEC-kantong-sendiri B-7). */
export interface UsulanPindahBukti {
  /** Pengeluaran/pemasukan rekening koran yang dijadikan pindah kantong. */
  id: string;
  updated_at: string;
  kantong_lawan: string;
  /** "BRI → DANA". */
  arah: string;
  /** Ringkasan transaksi itu untuk kartu. */
  label: string;
  /** Isian merchant pindah kantongnya ("Pindah ke DANA"). */
  merchant: string;
}

/**
 * Screenshot sisi lawan pindah antar rekening sendiri (B-7): bukti "transfer" (atau bukti
 * transfer yang arahnya pindah) dari kantong A ke kantong T, sementara rekening koran sudah
 * mencatat sisi satunya sebagai pengeluaran di A (atau pemasukan di T) — nominal sama, ±1 hari.
 * Pengeluaran/pemasukan itu ditawarkan dijadikan pindah, bukan dicatat baru. Null bila tidak ada.
 */
export async function cariPindahBukti(supabase: SupabaseClient, e: ExtractedReceipt): Promise<UsulanPindahBukti | null> {
  if (!(e.amount > 0) || e.pinjaman || e.paylater) return null;
  const { data: k } = await supabase.from("user_accounts").select("id, name, kind, aliases, nomor_akhir").in("kind", ["bank", "ewallet", "cash"]);
  const uang = (k ?? []) as KantongPindah[];
  let asal: KantongPindah | null = null;
  let tujuan: KantongPindah | null = null;
  if (e.type === "transfer") {
    asal = kantongBank(e.sumber_dana ?? e.payment_method, uang);
    tujuan = kantongNomor(e.rekening_tujuan, uang) ?? kantongBank(e.payment_target, uang);
  } else if (e.bukti_transfer) {
    const { data: pengguna } = await supabase.auth.getUser();
    const arah = tentukanArah(e.bukti_transfer, namaDariMetadata(pengguna?.user?.user_metadata), uang, e.rekening_tujuan);
    if (arah !== "pindah") return null;
    asal = kantongBank(e.bukti_transfer.pengirim.bank, uang);
    tujuan = kantongNomor(e.rekening_tujuan, uang) ?? kantongBank(e.bukti_transfer.penerima.bank, uang);
  }
  if (!asal || !tujuan || asal.id === tujuan.id) return null;
  const { data } = await supabase
    .from("transactions")
    .select(KOLOM)
    .eq("status", "confirmed")
    .eq("source", "statement")
    .eq("amount", e.amount)
    .is("kantong_tujuan_id", null)
    .is("ref_bank_tujuan", null)
    .is("induk_id", null)
    .is("cicilan_id", null)
    .is("pecahan_dari", null)
    .gte("transaction_date", geserHari(e.transaction_date, -1))
    .lte("transaction_date", geserHari(e.transaction_date, 1))
    .or(`and(type.eq.expense,kantong_id.eq.${asal.id}),and(type.eq.income,kantong_id.eq.${tujuan.id})`)
    .limit(10);
  const baris = ((data ?? []) as TransaksiPindah[]).sort(
    (a, b) => Math.abs(selisihHari(a.transaction_date, e.transaction_date)) - Math.abs(selisihHari(b.transaction_date, e.transaction_date)),
  );
  const t = baris[0];
  if (!t) return null;
  const keluar = t.type === "expense";
  const lawan = keluar ? tujuan : asal;
  return {
    id: t.id,
    updated_at: t.updated_at,
    kantong_lawan: lawan.id,
    arah: `${asal.name} → ${tujuan.name}`,
    label: [t.merchant ?? (keluar ? "Pengeluaran" : "Pemasukan"), `${keluar ? "−" : "+"}${fmtIDR(Number(t.amount))}`, fmtTanggalPendek(t.transaction_date), keluar ? asal.name : tujuan.name].join(" · "),
    merchant: `${keluar ? "Pindah ke" : "Pindah dari"} ${lawan.name}`,
  };
}

/** Terapkan kartu B-7: satu transaksi rekening koran jadi pindah kantong (RPC jadikan_pindah, tanpa sisi lawan). */
export async function terapkanPindahBukti(supabase: SupabaseClient, u: Pick<UsulanPindahBukti, "id" | "updated_at" | "kantong_lawan" | "merchant">): Promise<{ n: number; salinan: unknown[] }> {
  const { data, error } = await supabase.rpc("jadikan_pindah", {
    p: { ubah: [{ id: u.id, updated_at: u.updated_at, kantong_lawan: u.kantong_lawan, merchant: u.merchant.slice(0, 100), gabung: null }] },
  });
  if (error) throw new GalatPindah(error.code === "22023" || error.code === "23505" ? error.message : "Gagal menjadikan pindah kantong. Coba lagi.");
  const d = data as { n: number; salinan: unknown[] };
  return { n: d.n, salinan: d.salinan };
}
