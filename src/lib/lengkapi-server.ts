import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtTanggalPendek, geserHari, isoLokal } from "@/lib/format";
import { ambilIngatan } from "@/lib/ingat";
import { ambilKategori } from "@/lib/kategori-server";
import { namaKategori } from "@/lib/kategori";
import type { Kantong } from "@/lib/kantong";
import {
  buktiCocok,
  cariPasangan,
  isianLengkapi,
  isiDariEkstraksi,
  kantongCashback,
  labelTransaksi,
  refDariNamaBerkas,
  refDipakai,
  jenisBukti,
  type CalonLengkapi,
  type HasilPasangan,
  type IsiBukti,
  type IsianLengkapi,
  type Tetangga,
} from "@/lib/lengkapi";
import { ikutSaldo, saldoSejak, saldoSejakDari } from "@/lib/waktu";
import type { ExtractedReceipt, Transaction } from "@/types/transaction";

/**
 * Jalur server Lengkapi (docs/specs/SPEC-lengkapi.md): mencari bukti yang
 * sudah dipakai, kandidat pasangan, dan menerapkan isiannya. Semua lewat
 * klien Supabase user (RLS), jadi hanya data akun sendiri.
 */

/** Sidik isi gambar (16 hex sha-256): gambar yang sama dikenali tanpa AI. */
export const sidikGambar = (isi: Buffer | Uint8Array) => createHash("sha256").update(isi).digest("hex").slice(0, 16);

const KOLOM_TX = "id, amount, type, category, merchant, description, transaction_date, waktu, kantong_id, kantong_tujuan_id, ref_bukti, source, created_at, payment_method, perlu_dilengkapi, kelompok, usulan_pecah, status";
type BarisTx = Transaction & { created_at: string };

export interface Dipakai {
  id: string;
  label: string;
  /** Masih draft "Belum selesai". */
  draft: boolean;
}

const label = (t: BarisTx) => labelTransaksi(t, (iso) => fmtTanggalPendek(iso));

/** Transaksi yang ber-ref_bukti (paling baru dulu) — untuk mengenali bukti yang dikirim dua kali (§5). */
async function bertandaBukti(supabase: SupabaseClient): Promise<BarisTx[]> {
  const { data } = await supabase.from("transactions").select(KOLOM_TX).not("ref_bukti", "is", null).order("created_at", { ascending: false }).limit(5000);
  return (data ?? []) as BarisTx[];
}

/** Sebelum AI: sidik gambar atau pengenal di nama berkas sudah dipakai? */
export async function dipakaiSebelumAI(supabase: SupabaseClient, sidik: string, namaBerkas: string): Promise<Dipakai | null> {
  const daftar = await bertandaBukti(supabase);
  const t = refDipakai(daftar, { sidik }) ?? refDariNamaBerkas(namaBerkas, daftar);
  return t ? { id: t.id, label: label(t), draft: t.status === "needs_review" } : null;
}

/** Sesudah AI: Order SN / nomor bon yang sama sudah dipakai? */
export async function dipakaiSesudahAI(supabase: SupabaseClient, e: ExtractedReceipt): Promise<Dipakai | null> {
  if (!e.ref_bukti) return null;
  const t = refDipakai(await bertandaBukti(supabase), { jenis: jenisBukti(e), nilai: e.ref_bukti });
  return t ? { id: t.id, label: label(t), draft: t.status === "needs_review" } : null;
}

export interface KandidatLengkapi {
  id: string;
  label: string;
}

export interface UsulanLengkapi {
  kandidat: KandidatLengkapi[];
  pasti: boolean;
  /** Isian untuk kandidat pertama (pratinjau kartu). */
  perubahan: string[];
  tawarKategori: { category: string; nama: string } | null;
  /** Cashback dan kantong tujuannya; `buat` = kantong e-wallet itu belum ada (K4). */
  cashback: { nominal: number; kantong: string; buat: boolean } | null;
}

type KantongMini = Pick<Kantong, "id" | "name" | "kind" | "aliases" | "macam_simpanan" | "saldo_per" | "saldo_sejak">;
const ambilKantong = async (supabase: SupabaseClient) =>
  ((await supabase.from("user_accounts").select("id, name, kind, aliases, macam_simpanan, saldo_per, saldo_sejak")).data ?? []) as KantongMini[];

/** Urutan baris rekening koran per kantong & hari dari created_at; tanpa beda created_at = tidak diketahui. */
function urutanBank(baris: { id: string; kantong_id: string | null; transaction_date: string; created_at: string; waktu: string | null }[]): Map<string, number | null> {
  const grup = new Map<string, typeof baris>();
  for (const b of baris) grup.set(`${b.kantong_id}|${b.transaction_date}`, [...(grup.get(`${b.kantong_id}|${b.transaction_date}`) ?? []), b]);
  const hasil = new Map<string, number | null>();
  for (const g of grup.values()) {
    const beda = new Set(g.map((b) => b.created_at)).size === g.length;
    [...g].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).forEach((b, i) => hasil.set(b.id, beda ? i : null));
  }
  return hasil;
}

/** Kandidat pasangan (§1) untuk hasil baca AI. */
export async function cariKandidat(
  supabase: SupabaseClient,
  e: ExtractedReceipt,
  peringkat?: { ke: number; dari: number } | null,
  kantong?: KantongMini[],
): Promise<{ hasil: HasilPasangan; calon: BarisTx[]; kantong: KantongMini[] }> {
  const daftar = kantong ?? (await ambilKantong(supabase));
  const b = buktiCocok(e, daftar);
  if (b.tanpaKantong || !(b.nominal > 0)) return { hasil: { kandidat: [], pasti: false }, calon: [], kantong: daftar };
  const { data } = await supabase
    .from("transactions")
    .select(KOLOM_TX)
    .eq("status", "confirmed")
    .is("induk_id", null)
    .is("pecahan_dari", null)
    .eq("amount", b.nominal)
    // Struk ≥ 22.00 juga dicocokkan ke baris sehari sebelumnya; cariPasangan menyaring tanggal persisnya.
    .gte("transaction_date", geserHari(b.tanggal, -1))
    .lte("transaction_date", b.tanggal)
    .limit(50);
  const calon = (data ?? []) as BarisTx[];
  // Baris rekening koran di kantong & hari kandidat: urutan & jam tetangganya.
  const dariBank = calon.filter((t) => t.source === "statement" && t.kantong_id);
  let tetangga: Tetangga[] = [];
  const urut = new Map<string, number | null>();
  if (dariBank.length > 1) {
    const { data: lain } = await supabase
      .from("transactions")
      .select("id, kantong_id, transaction_date, waktu, created_at")
      .eq("status", "confirmed")
      .eq("source", "statement")
      .is("induk_id", null)
      .in("kantong_id", [...new Set(dariBank.map((t) => t.kantong_id!))])
      .in("transaction_date", [...new Set(dariBank.map((t) => t.transaction_date))])
      .limit(1000);
    const baris = (lain ?? []) as { id: string; kantong_id: string | null; transaction_date: string; created_at: string; waktu: string | null }[];
    for (const [id, n] of urutanBank(baris)) urut.set(id, n);
    tetangga = baris.flatMap((x) => (urut.get(x.id) == null ? [] : [{ id: x.id, kantong_id: x.kantong_id, transaction_date: x.transaction_date, urut: urut.get(x.id)!, waktu: x.waktu }]));
  }
  const calonCocok: CalonLengkapi[] = calon.map((t) => ({ ...t, urut: t.source === "statement" ? (urut.get(t.id) ?? null) : null }));
  const hasil = cariPasangan(b, calonCocok, { tetangga, peringkat });
  return { hasil, calon, kantong: daftar };
}

/** Isi bukti dengan kategori yang diingat per merchant (SPEC-ingat-kategori) bila ada. */
async function denganIngatan(supabase: SupabaseClient, isi: IsiBukti): Promise<IsiBukti> {
  if (!isi.merchant || (isi.type !== "expense" && isi.type !== "income")) return isi;
  const ingat = await ambilIngatan(supabase, isi.merchant, isi.type);
  return ingat ? { ...isi, category: ingat.category, kelompok: ingat.kelompok ?? null } : isi;
}

/** Usulan untuk kartu "Lengkapi transaksi ini?" — tidak mengubah apa pun. */
export async function susunUsulan(
  supabase: SupabaseClient,
  e: ExtractedReceipt,
  cari: Awaited<ReturnType<typeof cariKandidat>>,
): Promise<UsulanLengkapi> {
  const kategori = await ambilKategori(supabase);
  const pertama = cari.calon.find((t) => t.id === cari.hasil.kandidat[0]?.id)!;
  const nama = (slug: string, type: string) => namaKategori(kategori, slug, type as Transaction["type"]);
  const isi = await denganIngatan(supabase, isiDariEkstraksi(e));
  const { perubahan, tawarKategori } = isianLengkapi({ ...pertama, dipecah: false }, { ...isi, cashback: null }, { nama, jamBoleh: jamBoleh(pertama, isi.jam, cari.kantong) });
  const ck = isi.cashback ? kantongCashback(e.dompet, cari.kantong) : null;
  return {
    kandidat: cari.hasil.kandidat.slice(0, 5).map((k) => ({ id: k.id, label: label(cari.calon.find((t) => t.id === k.id)!) })),
    pasti: cari.hasil.pasti,
    perubahan,
    tawarKategori: tawarKategori ? { category: tawarKategori.category, nama: nama(tawarKategori.category, pertama.type) } : null,
    cashback: isi.cashback ? { nominal: isi.cashback, kantong: ck?.name ?? e.dompet ?? "ShopeePay", buat: !ck } : null,
  };
}

/**
 * Jam dari gambar boleh diisi? Tidak bila transaksinya di hari saldo kantong
 * dan jam itu sebelum saldo berlaku — mengisinya akan menggeser saldo
 * (nominal/kantong/saldo tidak diubah Lengkapi).
 */
function jamBoleh(tx: { transaction_date: string; kantong_id: string | null; kantong_tujuan_id?: string | null }, jam: string | null, kantong: KantongMini[]): boolean {
  if (!jam) return false;
  return [tx.kantong_id, tx.kantong_tujuan_id].every((id) => {
    const k = kantong.find((x) => x.id === id);
    if (!k?.saldo_per) return true;
    const s = saldoSejak({ saldo_per: k.saldo_per, saldo_sejak: k.saldo_sejak });
    return tx.transaction_date !== s.tanggal || ikutSaldo({ transaction_date: tx.transaction_date, waktu: jam }, s);
  });
}

export interface HasilLengkapi {
  transaction: Transaction;
  /** Nilai lama untuk Urungkan. */
  sebelum: IsianLengkapi;
  perubahan: string[];
  /** Cashback ikutan yang dibuat (dihapus saat Urungkan). */
  ikutan_id: string | null;
  /** Kantong e-wallet yang dibuat untuk cashback (K4). */
  kantong_baru: string | null;
  /** Cashback yang belum dicatat karena kantong e-wallet-nya belum ada. */
  cashback_tertunda: { nominal: number; dompet: string } | null;
}

export class GalatLengkapi extends Error {}

/**
 * Lengkapi satu transaksi (§2): kolom sesuai `isianLengkapi`, lalu cashback
 * sebagai ikutan di kantong e-wallet perantaranya (K2) — dibuat bila
 * `buatDompet` dan belum ada (K4). Nominal, tanggal, kantong tidak diubah.
 */
export async function terapkanLengkapi(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  isiAwal: IsiBukti,
  opsi: { dompet?: string | null; gantiKategori?: boolean; buatDompet?: boolean; paksa?: boolean; kantong?: KantongMini[] } = {},
): Promise<HasilLengkapi> {
  const [{ data: t }, { count: dipecah }, { data: ikutanAda }, kategori, kantong] = await Promise.all([
    supabase.from("transactions").select(KOLOM_TX).eq("id", id).maybeSingle(),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("pecahan_dari", id),
    supabase.from("transactions").select("id").eq("induk_id", id).eq("type", "income").limit(1),
    ambilKategori(supabase),
    opsi.kantong ? Promise.resolve(opsi.kantong) : ambilKantong(supabase),
  ]);
  const tx = t as BarisTx | null;
  if (!tx || tx.status !== "confirmed") throw new GalatLengkapi("Transaksinya sudah tidak ada atau belum selesai.");
  const isi = await denganIngatan(supabase, isiAwal);
  const nama = (slug: string, type: string) => namaKategori(kategori, slug, type as Transaction["type"]);
  const { patch, sebelum, perubahan } = isianLengkapi({ ...tx, dipecah: (dipecah ?? 0) > 0 }, isi, {
    nama,
    gantiKategori: opsi.gantiKategori,
    paksa: opsi.paksa,
    jamBoleh: jamBoleh(tx, isi.jam, kantong),
  });
  let baru = tx as Transaction;
  if (Object.keys(patch).length) {
    const { data, error } = await supabase.from("transactions").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    baru = data as Transaction;
  }

  // Cashback (K2): ikutan pemasukan di kantong e-wallet perantara, bila belum ada.
  let ikutan_id: string | null = null;
  let kantong_baru: string | null = null;
  let cashback_tertunda: HasilLengkapi["cashback_tertunda"] = null;
  if (isi.cashback && tx.type === "expense" && !(ikutanAda ?? []).length) {
    const dompet = opsi.dompet || "ShopeePay";
    let k = kantongCashback(dompet, kantong);
    if (!k && opsi.buatDompet) {
      k = await buatKantongDompet(supabase, userId, dompet);
      kantong_baru = k?.id ?? null;
    }
    if (k) ikutan_id = await catatCashback(supabase, userId, baru, isi.cashback, k.id);
    else cashback_tertunda = { nominal: isi.cashback, dompet };
  }
  const iCb = perubahan.findIndex((p) => p.startsWith("Cashback"));
  if (iCb >= 0 && !ikutan_id) perubahan.splice(iCb, 1);
  return { transaction: baru, sebelum, perubahan, ikutan_id, kantong_baru, cashback_tertunda };
}

/** Kantong e-wallet baru untuk cashback (K4): saldo 0 sejak sekarang; saldonya bisa diatur di Kantong. */
export async function buatKantongDompet(supabase: SupabaseClient, userId: string, nama: string): Promise<KantongMini | null> {
  const sekarang = new Date();
  const { data, error } = await supabase
    .from("user_accounts")
    .insert({ user_id: userId, name: nama.slice(0, 40), kind: "ewallet", emoji: "📱", saldo_awal: 0, saldo_per: isoLokal(sekarang), saldo_sejak: saldoSejakDari(isoLokal(sekarang), sekarang) })
    .select("id, name, kind, aliases, macam_simpanan, saldo_per, saldo_sejak")
    .single();
  if (error) {
    // Nama sudah dipakai kantong lain (mis. beda huruf): pakai yang itu.
    const { data: ada } = await supabase.from("user_accounts").select("id, name, kind, aliases, macam_simpanan, saldo_per, saldo_sejak").ilike("name", nama).maybeSingle();
    return (ada as KantongMini | null) ?? null;
  }
  return data as KantongMini;
}

/** Ikutan cashback (pemasukan Cashback/Refund) menempel ke `induk`, di kantong `kantongId`. */
export async function catatCashback(supabase: SupabaseClient, userId: string, induk: Transaction, nominal: number, kantongId: string): Promise<string | null> {
  const { data } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      type: "income",
      category: "refund",
      amount: nominal,
      merchant: induk.merchant,
      description: "Cashback",
      transaction_date: induk.transaction_date,
      kantong_id: kantongId,
      status: induk.status,
      source: induk.source,
      induk_id: induk.id,
    })
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

/** Urungkan Lengkapi: kolom kembali, cashback ikutan dihapus. */
export async function urungkanLengkapi(supabase: SupabaseClient, id: string, sebelum: IsianLengkapi, ikutanId: string | null): Promise<Transaction | null> {
  if (ikutanId) await supabase.from("transactions").delete().eq("id", ikutanId).eq("induk_id", id);
  const { data } = await supabase.from("transactions").update(sebelum).eq("id", id).select().maybeSingle();
  return (data as Transaction | null) ?? null;
}

/** Isi bukti dari draft (§4 "Lengkapi yang sudah ada"): kolom draft + nominal cashback ikutannya. */
export async function isiDariDraft(supabase: SupabaseClient, draftId: string): Promise<{ isi: IsiBukti; draft: BarisTx; dompet: string | null } | null> {
  const [{ data: d }, { data: ikutan }] = await Promise.all([
    supabase.from("transactions").select(KOLOM_TX).eq("id", draftId).maybeSingle(),
    supabase.from("transactions").select("amount, type, kantong_id, payment_method").eq("induk_id", draftId),
  ]);
  const draft = d as BarisTx | null;
  if (!draft || draft.status !== "needs_review") return null;
  const cb = ((ikutan ?? []) as { amount: number; type: string; kantong_id: string | null; payment_method: string | null }[]).find((x) => x.type === "income");
  let usulan = null;
  try {
    usulan = draft.usulan_pecah ? JSON.parse(draft.usulan_pecah) : null;
  } catch {}
  const jenis = draft.source === "payment_proof" ? "ss" : "struk";
  const ref = (draft.ref_bukti ?? "").split(/\s+/).find((x) => x.startsWith(`${jenis}:`))?.slice(jenis.length + 1);
  const sidik = (draft.ref_bukti ?? "").split(/\s+/).find((x) => x.startsWith("h:"))?.slice(2);
  return {
    draft,
    // Cashback draft sudah di kantong e-wallet perantaranya bila beda dengan kantong draft.
    dompet: cb && cb.kantong_id && cb.kantong_id !== draft.kantong_id ? cb.payment_method : null,
    isi: {
      jenis,
      type: draft.type,
      merchant: draft.merchant,
      jam: draft.waktu?.slice(0, 5) ?? null,
      category: draft.category,
      kelompok: draft.kelompok ?? null,
      description: draft.description,
      usulan_pecah: usulan,
      ref: ref && ref !== "-" ? ref : null,
      sidik: sidik ?? null,
      cashback: cb ? Number(cb.amount) : null,
    },
  };
}

/** Kandidat untuk draft "sudah tercatat?" (§4, dan pasangan ragu dari unggah banyak): kantong mana pun. */
export async function kandidatDraft(supabase: SupabaseClient, draftId: string): Promise<KandidatLengkapi[]> {
  const { data } = await supabase.from("transactions").select(KOLOM_TX).eq("id", draftId).maybeSingle();
  const d = data as BarisTx | null;
  if (!d || d.status !== "needs_review" || !(Number(d.amount) > 0)) return [];
  const e = {
    amount: Number(d.amount),
    type: d.type,
    transaction_date: d.transaction_date,
    time: d.waktu?.slice(0, 5) ?? null,
    document_type: d.source === "payment_proof" ? "payment_proof" : "receipt",
    sumber_dana: null,
    payment_method: null,
    payment_target: null,
    paylater: null,
  } as unknown as ExtractedReceipt;
  const cari = await cariKandidat(supabase, e);
  const daftar = cari.hasil.kandidat.filter((k) => k.id !== d.id);
  // Pasangan yang dipilih saat draft dibuat selalu ikut, paling depan.
  if (d.duplikat_dari && !daftar.some((k) => k.id === d.duplikat_dari)) {
    const { data: x } = await supabase.from("transactions").select(KOLOM_TX).eq("id", d.duplikat_dari).maybeSingle();
    if (x) {
      cari.calon.push(x as BarisTx);
      daftar.unshift({ id: (x as BarisTx).id } as CalonLengkapi);
    }
  } else if (d.duplikat_dari) daftar.sort((a, b) => Number(b.id === d.duplikat_dari) - Number(a.id === d.duplikat_dari));
  return daftar.slice(0, 5).map((k) => ({ id: k.id, label: label(cari.calon.find((t) => t.id === k.id)!) }));
}
