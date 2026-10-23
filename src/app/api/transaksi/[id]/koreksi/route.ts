import { NextRequest, NextResponse } from "next/server";
import { ambilUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { ambilKategori, ambilKonteksAI } from "@/lib/kategori-server";
import { kantongDariJawaban } from "@/lib/draft";
import { fmtIDR, fmtTanggal, JENIS } from "@/lib/format";
import { namaKategori } from "@/lib/kategori";
import { processReceiptText } from "@/lib/receipt";
import { TEKS_MAKS } from "@/lib/transaksi-input";
import type { Kantong } from "@/lib/kantong";
import { fmtJam } from "@/lib/waktu";
import type { Transaction } from "@/types/transaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Kolom yang bisa dikoreksi lewat obrolan (dan dikembalikan saat dibatalkan). */
type IsianKoreksi = Pick<
  Transaction,
  "amount" | "type" | "category" | "merchant" | "description" | "transaction_date" | "waktu" | "kantong_id" | "kantong_tujuan_id" | "payment_method"
>;

/**
 * Koreksi transaksi yang barusan tersimpan, diketik di obrolan ("eh yang
 * tadi pakai BCA", "nominalnya 25rb"). AI membaca transaksi apa adanya +
 * koreksinya; yang berubah saja yang disimpan.
 *
 * Balasan: { transaction, sebelum, perubahan: string[] } — `sebelum` untuk
 * tombol "Batalkan perubahan" (dikembalikan dari browser).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await ambilUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { teks?: unknown } | null;
  const teks = typeof body?.teks === "string" ? body.teks.trim().slice(0, TEKS_MAKS) : "";
  if (!teks) return NextResponse.json({ error: "Koreksinya masih kosong." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: daftarKantong }, kategori, konteks] = await Promise.all([
    supabase.from("transactions").select("*").eq("id", id).eq("status", "confirmed").maybeSingle(),
    supabase.from("user_accounts").select("id, name, kind, aliases"),
    ambilKategori(supabase),
    ambilKonteksAI(supabase),
  ]);
  const tx = data as Transaction | null;
  if (!tx) return NextResponse.json({ error: "Transaksinya nggak ketemu." }, { status: 404 });
  const semua = (daftarKantong ?? []) as Pick<Kantong, "id" | "name" | "kind" | "aliases">[];
  const tujuanLama = semua.find((k) => k.id === tx.kantong_tujuan_id)?.name;

  // Transaksi apa adanya, dalam bahasa yang sama dengan catatan biasa, lalu
  // koreksinya ditandai jelas — model menyusun ulang transaksi utuh.
  const asal = [
    `${JENIS[tx.type]}: ${tx.merchant ?? namaKategori(kategori, tx.category, tx.type)}`,
    `kategori ${tx.category}`,
    fmtIDR(Number(tx.amount)),
    tx.payment_method ? `pakai ${tx.payment_method}` : null,
    tujuanLama ? `ke ${tujuanLama}` : null,
    `tanggal ${tx.transaction_date}`,
    tx.waktu ? `jam ${fmtJam(tx.waktu)}` : null,
    tx.description ? `keterangan: ${tx.description}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const hasil = await processReceiptText(
    `Transaksi yang sudah tercatat: ${asal}\n\n---\nKoreksi dari pengguna (terapkan ke transaksi di atas; isian yang tidak disebut tetap sama): ${teks}`,
    konteks,
  );
  const e = hasil.extracted;
  if (!e || !(e.amount > 0)) {
    return NextResponse.json({ error: "Aku belum nangkep koreksinya. Coba sebut yang mau diganti, mis. “nominalnya 25rb”." }, { status: 422 });
  }

  const patch: Partial<IsianKoreksi> = {};
  const perubahan: string[] = [];
  const ganti = <K extends keyof IsianKoreksi>(kolom: K, nilai: IsianKoreksi[K], label?: string) => {
    if (nilai === undefined || nilai === null || String(nilai) === String(tx[kolom] ?? "")) return;
    patch[kolom] = nilai;
    if (label) perubahan.push(label);
  };

  ganti("amount", e.amount, `Nominal: ${fmtIDR(Number(tx.amount))} → ${fmtIDR(e.amount)}`);
  ganti("type", e.type, `Jenis: ${JENIS[tx.type]} → ${JENIS[e.type]}`);
  ganti("category", e.category, `Kategori: ${namaKategori(kategori, tx.category, tx.type)} → ${namaKategori(kategori, e.category, e.type)}`);
  if (e.merchant) ganti("merchant", e.merchant, `Nama: ${tx.merchant ?? "—"} → ${e.merchant}`);
  if (e.description) ganti("description", e.description);
  ganti("transaction_date", e.transaction_date, `Tanggal: ${fmtTanggal(tx.transaction_date)} → ${fmtTanggal(e.transaction_date)}`);
  if (e.time && e.time !== tx.waktu?.slice(0, 5)) {
    patch.waktu = e.time;
    perubahan.push(`Jam: ${fmtJam(tx.waktu) ?? "—"} → ${fmtJam(e.time)}`);
  }

  const type = patch.type ?? tx.type;
  const k = e.payment_method ? kantongDariJawaban(e.payment_method, type === "transfer" ? semua : semua.filter((x) => x.kind !== "orang")) : null;
  if (k && k.id !== tx.kantong_id) {
    patch.kantong_id = k.id;
    patch.payment_method = k.name;
    perubahan.push(`Kantong: ${tx.payment_method ?? "—"} → ${k.name}`);
  }
  if (type === "transfer" && e.payment_target) {
    const t = kantongDariJawaban(e.payment_target, semua);
    if (t && t.id !== tx.kantong_tujuan_id && t.id !== (patch.kantong_id ?? tx.kantong_id)) {
      patch.kantong_tujuan_id = t.id;
      perubahan.push(`Ke kantong: ${tujuanLama ?? "—"} → ${t.name}`);
    }
  }

  if (!perubahan.length) {
    return NextResponse.json({ error: "Nggak ada yang berubah. Sebut yang mau diganti, mis. “kantongnya BCA” atau “nominalnya 25rb”." }, { status: 422 });
  }

  const { data: baru, error } = await supabase.from("transactions").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: "Gagal menyimpan koreksinya." }, { status: 500 });

  // Biaya admin / cashback ikut kantong induknya.
  if (patch.kantong_id) await supabase.from("transactions").update({ kantong_id: patch.kantong_id, payment_method: patch.payment_method }).eq("induk_id", id);

  const sebelum = Object.fromEntries(Object.keys(patch).map((kolom) => [kolom, tx[kolom as keyof Transaction]]));
  return NextResponse.json({ transaction: baru as Transaction, sebelum, perubahan });
}
