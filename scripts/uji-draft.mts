/**
 * Uji catat sebagai obrolan (src/lib/draft.ts).
 *
 * Pemakaian: npm run uji:draft
 */
import assert from "node:assert/strict";
import { processReceiptText, type AiTeks } from "../src/lib/receipt.ts";
import { isoLokal } from "../src/lib/format.ts";
import { apakahKoreksi, bacaNominal, bacaTenor, kalimatBelumAda, kalimatKartu, kalimatTanya, kantongDariJawaban, mauHapus, pertanyaanDraft, tanggalHapusDraft } from "../src/lib/draft.ts";
import { bacaPetunjuk, bankRekening, namaKantongBaru, nomorAkhir, simpanPetunjuk, usulanKantongBaru } from "../src/lib/petunjuk.ts";
import { normalize, tokoAgen } from "../src/lib/extract.ts";
import { alasanTidakIkut } from "../src/lib/draft.ts";
import { asalJejak, bacaanDari, gabungJejak, gelembungJejak, jejakRekening, langkahJawab, teksBacaan } from "../src/lib/jejak.ts";
import { simpanTransaksi } from "../src/lib/simpan-transaksi.ts";
import { selesaikanDraft, urungkanSimpan } from "../src/lib/simpan-draft.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedReceipt, Transaction } from "../src/types/transaction.ts";

const d = (t: Partial<Parameters<typeof pertanyaanDraft>[0]>) =>
  pertanyaanDraft({ status: "needs_review", amount: 0, type: "expense", category: "other", merchant: null, kantong_id: null, kantong_tujuan_id: null, ...t });

// Urutan pertanyaan: cerita / nominal → kantong → tujuan → konfirmasi.
assert.equal(d({}), "cerita");
assert.equal(d({ merchant: "SPBU" }), "nominal");
assert.equal(d({ category: "transport" }), "nominal");
assert.equal(d({ amount: 20000 }), "kantong");
assert.equal(d({ amount: "20000.00", kantong_id: "k1" }), "konfirmasi");
assert.equal(d({ amount: 50000, type: "transfer", kantong_id: "k1" }), "kantong_tujuan");
// Tagihan kartu kredit yang belum terdaftar (SPEC-tagihan-cicilan §1): kantong asal dulu, lalu kartunya.
assert.equal(d({ amount: 200000, type: "transfer", merchant: "Kartu kredit Mandiri" }), "kantong");
assert.equal(d({ amount: 200000, type: "transfer", merchant: "Kartu kredit Mandiri", kantong_id: "k1" }), "kartu");
assert.equal(d({ amount: 200000, type: "transfer", merchant: "Budi", kantong_id: "k1" }), "kantong_tujuan");
assert.equal(kalimatKartu("Kartu kredit Mandiri"), "Kartu kredit Mandiri belum terdaftar. Bayar ke kartu yang mana?");
assert.equal(d({ amount: 50000, type: "transfer", kantong_id: "k1", kantong_tujuan_id: "k2" }), "konfirmasi");
assert.equal(d({ status: "confirmed" }), null);

// Nominal dari ketikan.
const nominal: [string, number | null][] = [
  ["150.000", 150000], ["150000", 150000], ["Rp 150.000", 150000], ["rp150.000", 150000],
  ["150rb", 150000], ["150 ribu", 150000], ["150k", 150000], ["1,5jt", 1500000], ["1.5 juta", 1500000],
  ["2jt", 2000000], ["kira-kira 60rb", 60000], ["abc", null], ["0", null], ["", null],
];
for (const [teks, harap] of nominal) assert.equal(bacaNominal(teks), harap, teks);

// Kantong dari ketikan atau chip.
const daftar = [
  { id: "a", name: "BCA", aliases: null },
  { id: "b", name: "GoPay", aliases: ["gopay later"] },
  { id: "c", name: "Bank Jago", aliases: null },
  { id: "d", name: "Tunai", aliases: null },
];
assert.equal(kantongDariJawaban("b", daftar)?.name, "GoPay"); // id dari chip
assert.equal(kantongDariJawaban("bca", daftar)?.name, "BCA");
assert.equal(kantongDariJawaban("pakai BCA dong", daftar)?.name, "BCA");
assert.equal(kantongDariJawaban("dari bank jago", daftar)?.name, "Bank Jago");
assert.equal(kantongDariJawaban("tunai", daftar)?.name, "Tunai");
assert.equal(kantongDariJawaban("mandiri", daftar), null);

// Koreksi vs catatan baru.
for (const k of ["eh yang tadi pakai BCA", "salah, harusnya 25rb", "nominalnya 25rb", "bukan makan tapi belanja", "ganti kantongnya ke gopay", "oiya tadi tanggal kemarin", "Harusnya pakai DANA"]) {
  assert.equal(apakahKoreksi(k), true, k);
}
for (const b of ["beli makan di warteg 20k", "kopi 25rb gopay", "isi bensin pakai bca", "transfer ke budi 50k", "bayar listrik 300rb", "gaji masuk bri 5jt"]) {
  assert.equal(apakahKoreksi(b), false, b);
}

// Minta dihapus vs jawaban biasa.
for (const h of ["hapus saja transaksi ini bro", "hapus", "batalin aja", "ga jadi", "gak usah dicatat", "tidak jadi bro", "buang aja", "apusin yang tadi", "cancel"]) {
  assert.equal(mauHapus(h), true, h);
}
for (const b of ["bca", "pakai gopay", "jam 10", "150rb", "ya", "bukan bca tapi gopay", "ga jadi 50rb tapi 40rb", "hapusan kantor 20rb"]) {
  assert.equal(mauHapus(b), false, b);
}

// Paylater: tidak ditanya kantong; setelah nominal langsung tenor.
assert.equal(d({ amount: 15680, paylater: "SPayLater" }), "tenor");
assert.equal(d({ merchant: "BP", paylater: "SPayLater" }), "nominal");
const tenor: [string, number | null][] = [
  ["3", 3], ["3x", 3], ["3 kali", 3], ["6 bulan", 6], ["12×", 12], ["dicicil 3 kali aja", 3], ["sekali", 1], ["lunas bulan depan", 1],
  ["", null], ["gatau", null], ["150rb", null], ["0", null], ["500", null],
];
for (const [teks, harap] of tenor) assert.equal(bacaTenor(teks), harap, teks);

// Duplikat: draft lengkap yang sama persis dengan transaksi tercatat ditanya dulu.
assert.equal(d({ amount: 30, kantong_id: "k1", duplikat_dari: "t1" }), "duplikat");
assert.equal(d({ amount: 30, kantong_id: "k1", duplikat_dari: null }), "konfirmasi");
assert.equal(d({ amount: 0, merchant: "X", duplikat_dari: "t1" }), "nominal"); // yang kurang tetap ditanya dulu

// Tanggal hapus otomatis dihitung dari hari WIB, bukan zona browser/server (SPEC-perbaikan-temuan D3).
assert.equal(tanggalHapusDraft("2026-10-22T05:00:00Z"), "2026-11-21"); // 12.00 WIB
assert.equal(tanggalHapusDraft("2026-10-22T18:30:00Z"), "2026-11-22"); // 01.30 WIB 23 Okt
assert.equal(tanggalHapusDraft("2026-10-22T16:59:00Z"), "2026-11-21"); // 23.59 WIB 22 Okt

// Ketikan: Groq tidak valid → Gemini sekali; galat Groq → Gemini; keduanya gagal → draft (SPEC-perbaikan-temuan K7).
const hasil = (amount: number) =>
  ({ amount, type: "expense", merchant: "Kopi", category: "food", transaction_date: isoLokal(new Date()), time: null, time_hint: null, description: null, payment_method: null, payment_target: null, fee: null, cashback: null, pinjaman: null, cicilan: null, paylater: null, document_type: "receipt" }) as Awaited<ReturnType<AiTeks["gemini"]>>;
const ai = (groq: number | Error, gemini: number | Error) => {
  const panggil = { groq: 0, gemini: 0 };
  const a: AiTeks = {
    groq: async () => (panggil.groq++, groq instanceof Error ? Promise.reject(groq) : { extracted: hasil(groq), model: "uji" }),
    gemini: async () => (panggil.gemini++, gemini instanceof Error ? Promise.reject(gemini) : hasil(gemini)),
  };
  return { a, panggil };
};
{
  const { a, panggil } = ai(25000, 30000);
  const r = await processReceiptText("kopi 25rb", undefined, a);
  assert.deepEqual([r.status, r.source, r.extracted?.amount, panggil.gemini], ["confirmed", "groq", 25000, 0], "Groq sah: Gemini tidak dipanggil");
}
{
  const { a, panggil } = ai(0, 25000);
  const r = await processReceiptText("kopi 25rb", undefined, a);
  assert.deepEqual([r.status, r.source, r.extracted?.amount, panggil.gemini], ["confirmed", "gemini_text", 25000, 1], "Groq tidak sah: Gemini sekali");
}
{
  const { a, panggil } = ai(0, 0);
  const r = await processReceiptText("kopi", undefined, a);
  assert.deepEqual([r.status, r.source, panggil.gemini], ["needs_review", "groq", 1], "keduanya tidak sah: draft dari hasil Groq");
}
{
  const { a } = ai(0, new Error("429"));
  const r = await processReceiptText("kopi", undefined, a);
  assert.deepEqual([r.status, r.source], ["needs_review", "groq"], "Gemini galat: draft dari hasil Groq");
}
{
  const { a } = ai(new Error("429"), 25000);
  const r = await processReceiptText("kopi 25rb", undefined, a);
  assert.deepEqual([r.status, r.source], ["confirmed", "gemini_text"], "Groq galat: Gemini");
}
{
  const { a } = ai(new Error("429"), new Error("503"));
  const r = await processReceiptText("kopi", undefined, a);
  assert.deepEqual([r.status, r.source], ["needs_review", "none"], "semua galat: draft kosong");
}

// ---- SPEC-kantong-sendiri: petunjuk kantong, "+ Buat kantong", kalimat (data BUATAN).
{
  const pj = (p: Parameters<typeof simpanPetunjuk>[1]) => simpanPetunjuk(null, p);
  // Petunjuk disimpan di kolom bukti_transfer & dibaca lagi; kosong → null.
  assert.deepEqual(bacaPetunjuk(pj({ sumber: "GoPay", tujuan: null })), { sumber: "GoPay" });
  assert.equal(simpanPetunjuk(null, {}), null);
  assert.equal(simpanPetunjuk(pj({ sumber: "GoPay" }), { sumber: null }), null, "petunjuk yang dikosongkan hilang");
  assert.deepEqual(bacaPetunjuk(simpanPetunjuk(pj({ sumber: "GoPay" }), { tujuan: "DANA" })), { sumber: "GoPay", tujuan: "DANA" }, "digabung");
  assert.deepEqual(bacaPetunjuk("rusak"), {});
  // Urutan: B-4 "dari rekeningmu sendiri?" sebelum kantong; D-2 "cicilan yang mana?" sebelum kantong.
  assert.equal(d({ amount: 50000, type: "transfer", kantong_tujuan_id: "dana", bukti_transfer: pj({ lembaga: "Jago" }) }), "sendiri");
  assert.equal(d({ amount: 50000, type: "transfer", kantong_id: "jago", kantong_tujuan_id: "dana", bukti_transfer: pj({ lembaga: "Jago" }) }), "konfirmasi");
  assert.equal(d({ amount: 150000, type: "expense", bukti_transfer: pj({ cicilan: "Shopee PayLater" }) }), "cicilan");
  assert.equal(d({ amount: 150000, type: "expense", cicilan_id: "c1", bukti_transfer: pj({ cicilan: "Shopee PayLater" }) }), "kantong");
  // B-6: pindah kantong menanyakan asalnya; B-4 menyebut banknya.
  assert.equal(kalimatTanya("kantong", { type: "transfer" }), "Uangnya dari kantong mana?");
  assert.equal(kalimatTanya("kantong", { type: "expense" }), "Pakai kantong apa?");
  assert.equal(kalimatTanya("kantong_tujuan", { type: "transfer" }), "Pindah ke kantong mana?");
  assert.equal(kalimatTanya("sendiri", { type: "transfer", bukti_transfer: pj({ lembaga: "Jago" }) }), "Uang dari Jago ini dari rekeningmu sendiri?");
  assert.equal(kalimatBelumAda("GoPay"), "Kantong “GoPay” belum ada. Buat sekarang?");
  // Nama kantong baru dari yang terbaca/diketik (A-1).
  for (const [teks, nama] of [
    ["kantong GoPay", "GoPay"],
    ["bank jago", "Jago"],
    ["PT Bank Jago", "Jago"],
    ["SPayLater", "Shopee PayLater"],
    ["Tunai", "Tunai"],
    ["cash", "Tunai"],
    ["QRIS", null],
    ["Transfer", null],
    ["dompet merah", "dompet merah"],
    ["nominalnya 40rb", null],
    ["BANK KOPERASI", "Bank Koperasi"],
    ["", null],
  ] as const)
    assert.equal(namaKantongBaru(teks), nama, `nama kantong baru dari "${teks}"`);
  // "+ Buat kantong <nama>" hanya untuk sisi yang ditanya, dan hanya bila belum ada kantongnya.
  const ada = [{ name: "BRI" }, { name: "DANA" }];
  assert.equal(usulanKantongBaru("kantong", { payment_method: "GoPay", bukti_transfer: null }, ada), "GoPay");
  assert.equal(usulanKantongBaru("kantong", { payment_method: "Bank BRI", bukti_transfer: null }, ada), null, "sudah ada (alias)");
  assert.equal(usulanKantongBaru("kantong", { payment_method: null, bukti_transfer: pj({ sumber: "Tunai" }) }, ada), "Tunai", "B-5 top up agen tanpa kantong Tunai");
  assert.equal(usulanKantongBaru("kantong_tujuan", { payment_method: "BRI", bukti_transfer: pj({ tujuan: "JAGO" }) }, ada), "Jago");
  assert.equal(usulanKantongBaru("kantong_tujuan", { payment_method: "BRI", bukti_transfer: null }, ada), null, "tujuan tidak terbaca");
  assert.equal(usulanKantongBaru("kantong_tujuan", { payment_method: "BRI", bukti_transfer: pj({ tujuan: "Shopee PayLater" }) }, ada), "Shopee PayLater", "D-4 kantong utang");
  assert.equal(nomorAkhir("Jago …4321"), "4321");
  assert.equal(nomorAkhir("BCA 1234567890"), "7890");
  assert.equal(nomorAkhir(null), null);
  assert.equal(bankRekening("Jago …4321"), "Jago");
}

// ---- Hasil baca tiruan: "Receive Money from <lembaga>" (B-4) & top up lewat agen (B-5).
{
  const dasar = { amount: 50000, transaction_date: "2026-09-03", category: "other", document_type: "payment_proof" as const };
  const terima = normalize({ ...dasar, type: "transfer", payment_method: "Bank Contoh", payment_target: "DANA", merchant: null }, undefined, true);
  assert.deepEqual([terima.type, terima.payment_method, terima.payment_target, terima.bukti_transfer], ["transfer", "Bank Contoh", "DANA", null]);
  const agen = normalize({ ...dasar, type: "transfer", payment_method: "ALFAMART", payment_target: "DANA", merchant: "Alfamart" }, undefined, true);
  assert.deepEqual([agen.payment_method, agen.merchant, agen.description], ["Tunai", null, "Top up lewat Alfamart"], "nama toko → keterangan, sumbernya Tunai");
  const agen2 = normalize({ ...dasar, type: "transfer", payment_method: "Tunai", payment_target: "DANA", merchant: null, description: "Top up lewat Indomaret" }, undefined, true);
  assert.deepEqual([agen2.payment_method, agen2.description], ["Tunai", "Top up lewat Indomaret"]);
  // Belanja di Alfamart (bukan top up) tidak disentuh.
  const belanja = normalize({ ...dasar, type: "expense", category: "groceries", payment_method: "DANA", merchant: "ALFAMART" }, undefined, true);
  assert.deepEqual([belanja.merchant, belanja.payment_method], ["ALFAMART", "DANA"]);
  const tarik = normalize({ ...dasar, type: "transfer", payment_method: "BCA", payment_target: "Tunai", merchant: "Indomaret" }, undefined, true);
  assert.deepEqual([tarik.payment_method, tarik.merchant], ["BCA", "Indomaret"], "tarik tunai di toko bukan top up");
  assert.equal(tokoAgen("Top Up via Agent (ALFAMART)"), "Alfamart");
  assert.equal(tokoAgen("BCA"), null);
}

// ---- Periksa dulu (SPEC-periksa-dulu): database tiruan yang mencatat tulisan & RPC berurutan.
type Log = { jenis: string; tabel?: string; isi?: unknown; filter?: unknown[] };
function dbTiruan(data: Record<string, unknown[]>) {
  const log: Log[] = [];
  const from = (tabel: string) => {
    let aksi = "select";
    let isi: unknown = null;
    const filter: unknown[] = [];
    const hasil = () => (aksi === "insert" ? (Array.isArray(isi) ? isi : [{ id: "tx-baru", created_at: "2026-11-08T03:00:00Z", ...(isi as object) }]) : aksi === "update" ? [{ id: "tx-1", ...(data[tabel]?.[0] as object), ...(isi as object) }] : (data[tabel] ?? []));
    const q: Record<string, unknown> = {};
    for (const f of ["select", "eq", "is", "in", "not", "neq", "gte", "order", "limit", "or", "range"]) q[f] = (...a: unknown[]) => (f === "select" ? q : (filter.push([f, ...a]), q));
    q.insert = (x: unknown) => ((aksi = "insert"), (isi = x), log.push({ jenis: "insert", tabel, isi: x }), q);
    q.update = (x: unknown) => ((aksi = "update"), (isi = x), log.push({ jenis: "update", tabel, isi: x, filter }), q);
    q.delete = () => ((aksi = "delete"), log.push({ jenis: "delete", tabel, filter }), q);
    q.single = async () => ({ data: hasil()[0] ?? null, error: null });
    q.maybeSingle = q.single;
    q.then = (ok: (v: unknown) => void) => ok({ data: hasil(), error: null });
    return q;
  };
  const db = {
    from,
    rpc: async (nama: string, arg: unknown) => (log.push({ jenis: "rpc", tabel: nama, isi: arg }), { data: true, error: null }),
    auth: { getUser: async () => ({ data: { user: { user_metadata: {} } } }) },
  };
  return { db: db as unknown as SupabaseClient, log };
}
{
  const KANTONG = [{ id: "k1", name: "GoPay", kind: "ewallet", aliases: [], saldo_per: "2026-01-01", saldo_sejak: null, macam_simpanan: null, nomor_akhir: null }];
  const dasarAi = { payment_target: null, amount: 25_000, type: "expense", category: "food", merchant: "Kopi Contoh", description: null, payment_method: "GoPay", transaction_date: "2026-11-08", jam: "08:15", petunjuk_jam: null, status: "confirmed", source: "text", raw_ocr_text: "kopi 25rb gopay", user_id: "u1" };
  // Hasil Catat yang lengkap tetap draft (D1) dengan pertanyaan konfirmasi; teks aslinya dibawa untuk jejak.
  const a = dbTiruan({ user_accounts: KANTONG, transactions: [] });
  const r = await simpanTransaksi(a.db, "u1", { ...dasarAi });
  const sisip = a.log.find((x) => x.jenis === "insert" && x.tabel === "transactions")!.isi as Record<string, unknown>;
  assert.equal(r.pertanyaan, "konfirmasi");
  assert.deepEqual([sisip.status, sisip.kantong_id, sisip.raw_ocr_text], ["needs_review", "k1", "kopi 25rb gopay"]);
  assert.equal(alasanTidakIkut(sisip as never), null, "lengkap & tidak ditandai: ikut Simpan semua");
  // Catat manual (tanpa payment_target) tetap langsung tersimpan.
  const m = dbTiruan({ user_accounts: KANTONG, transactions: [] });
  const { payment_target: _, ...manual } = { ...dasarAi, kantong_id: "k1" };
  void _;
  await simpanTransaksi(m.db, "u1", manual);
  assert.equal((m.log.find((x) => x.jenis === "insert")!.isi as Record<string, unknown>).status, "confirmed");
  // Hasil AI yang ragu (pipeline: tidak valid): ditandai, tidak ikut Simpan semua.
  const g = dbTiruan({ user_accounts: KANTONG, transactions: [] });
  await simpanTransaksi(g.db, "u1", { ...dasarAi, status: "needs_review" });
  const ragu = g.log.find((x) => x.jenis === "insert")!.isi as Record<string, unknown>;
  assert.equal(pertanyaanDraft(ragu as never), "konfirmasi");
  assert.equal(alasanTidakIkut(ragu as never), "ragu");
  // Belum punya kantong sama sekali: tidak ditanya "Pakai kantong apa?".
  const t = dbTiruan({ user_accounts: [], transactions: [] });
  const rt = await simpanTransaksi(t.db, "u1", { ...dasarAi });
  assert.equal(rt.pertanyaan, "konfirmasi");

  // Syarat Simpan semua: pertanyaan terbuka, dugaan dobel → tidak ikut.
  const dr = { status: "needs_review", amount: 10_000, type: "expense", category: "food", merchant: "X", kantong_id: "k1", kantong_tujuan_id: null };
  assert.equal(alasanTidakIkut({ ...dr, kantong_id: null }), "tanya");
  assert.equal(alasanTidakIkut({ ...dr, duplikat_dari: "lama" }), "dobel");
  assert.equal(alasanTidakIkut({ ...dr, bukti_transfer: simpanPetunjuk(null, { sumber: "Jago" }) }), null);
  assert.equal(alasanTidakIkut({ ...dr, status: "confirmed" }), "tanya");

  // Simpan memakai logika selesai bersama: jejak dulu (sebelum baris draft-nya hilang), lalu status,
  // nomor cicilan ditetapkan, ikutan ikut dihitung.
  const tx = { id: "tx-1", status: "needs_review", amount: 100_000, type: "expense", category: "shopping", merchant: "HP", kantong_id: "k1", kantong_tujuan_id: null, payment_method: "GoPay", cicilan_id: "c1", cicilan_ke: null, description: null, raw_ocr_text: "bayar cicilan hp", bukti_transfer: null, transaction_date: "2026-11-08" } as unknown as Transaction;
  const s = dbTiruan({ cicilan: [{ nama: "HP", penyedia: null, tenor: 3, jatuh_tempo_awal: "2026-10-01", nominal: 100_000 }], transactions: [tx] });
  const hasil = await selesaikanDraft(s.db, tx, "kartu");
  const urut = s.log.map((x) => `${x.jenis}:${x.tabel}`);
  assert.ok(urut.indexOf("rpc:tambah_jejak") < urut.indexOf("update:transactions"), urut.join(" "));
  const patch = s.log.find((x) => x.jenis === "update")!.isi as Record<string, unknown>;
  assert.deepEqual([patch.status, patch.raw_ocr_text, patch.cicilan_id, patch.cicilan_ke], ["confirmed", null, "c1", 1]);
  assert.equal(s.log.filter((x) => x.jenis === "update" && JSON.stringify(x.filter).includes("induk_id")).length, 2, "ikutan ikut");
  assert.deepEqual((s.log.find((x) => x.tabel === "tambah_jejak")!.isi as { p_isi: { cara: string } }).p_isi.cara, "kartu");
  assert.deepEqual([hasil.sebelum.raw_ocr_text, hasil.sebelum.cicilan_ke], ["bayar cicilan hp", null]);
  // Urungkan: kembali draft dengan isi sebelumnya; jejak & thumbnail dikembalikan ke draft.
  const u = dbTiruan({ transactions: [{ id: "tx-1" }] });
  assert.equal(await urungkanSimpan(u.db, "tx-1", hasil.sebelum), true);
  assert.equal((u.log[0].isi as Record<string, unknown>).status, "needs_review");
  assert.equal((u.log[0].isi as Record<string, unknown>).raw_ocr_text, "bayar cicilan hp");
  assert.ok(u.log.some((x) => x.tabel === "urungkan_jejak"));
}

// ---- "Cara dicatat": isi jejak (urutan tanya-jawab, koreksi), gelembung hanya-baca.
{
  const e = { amount: 400_000, type: "transfer", merchant: null, transaction_date: "2026-11-08", time: "10:05", payment_method: "BRI", payment_target: "Jago", bukti_transfer: { pengirim: { nama: "Rina Contoh", bank: "BRI" }, penerima: { nama: "Rina Contoh", bank: "Jago" } } } as unknown as ExtractedReceipt;
  const b = bacaanDari(e)!;
  assert.deepEqual([b.nominal, b.sumber, b.tujuan, b.pengirim, b.jam], [400_000, "BRI", "Jago", "Rina Contoh", "10:05"]);
  assert.equal(bacaanDari(null), null);
  assert.match(teksBacaan(b)!, /^Kebaca: Rp\s?400\.000 · pindah kantong · 8 Nov 10\.05 · Rina Contoh → Rina Contoh · dari BRI · ke Jago$/);
  assert.equal(asalJejak("text"), "ketikan");
  assert.equal(asalJejak("payment_proof"), "bukti");
  assert.equal(asalJejak("receipt", true), "banyak");
  assert.deepEqual(langkahJawab("Ini uang keluar atau masuk?", "  "), []);
  // Digabung seperti di database: tanya-jawab berurutan, koreksi menyusul, kunci lain ditimpa.
  let isi = gabungJejak(null, { asal: "bukti", bacaan: b });
  isi = gabungJejak(isi, { langkah: langkahJawab("Ini uang keluar atau masuk?", "Aku kirim ke Rina") });
  isi = gabungJejak(isi, { langkah: [{ t: "koreksi", teks: "eh itu ke rekeningku sendiri" }] });
  isi = gabungJejak(isi, { disimpan: "2026-11-08T03:10:00Z", cara: "kartu" });
  assert.deepEqual(isi.langkah!.map((l) => l.t), ["tanya", "jawab", "koreksi"]);
  assert.equal(isi.asal, "bukti");
  const gel = gelembungJejak([{ id: 7, isi, ada_foto: true }], () => "8 Nov 10.10");
  assert.deepEqual(
    gel.map((x) => [x.dari, x.foto ?? x.teks]),
    [
      ["info", "Dari bukti transfer di Catat"],
      ["saya", 7],
      ["app", teksBacaan(b)],
      ["app", "Ini uang keluar atau masuk?"],
      ["saya", "Aku kirim ke Rina"],
      ["saya", "Koreksi: eh itu ke rekeningku sendiri"],
      ["info", "Disimpan dari kartu periksa · 8 Nov 10.10"],
    ],
  );
  assert.equal(gabungJejak({ langkah: Array.from({ length: 59 }, () => ({ t: "tanya" as const, teks: "a" })) }, { langkah: langkahJawab("b", "c") }).langkah!.length, 60);
  // Rekening koran: dari kolom yang sudah ada, tanpa PDF (K1).
  assert.deepEqual(jejakRekening({ source: "statement", ref_bank: "bri:4321:2026-09-02T10:00:00:-50000:100", description: "Transfer ke Contoh" }), [
    { dari: "info", teks: "Diimpor dari rekening koran BRI" },
    { dari: "saya", teks: "Baris bank: Transfer ke Contoh" },
  ]);
  assert.equal(jejakRekening({ source: "statement", ref_bank: "sea:1234:2026-09-03:-32500:967500" })![0].teks, "Diimpor dari rekening koran SeaBank");
  assert.equal(jejakRekening({ source: "text" }), null);
}

console.log("✓ draft: urutan pertanyaan, nominal ketikan (rb/jt/Rp/titik), kantong dari chip & kalimat, koreksi vs catatan baru, minta hapus, tenor paylater, duplikat, tanggal hapus WIB, cadangan Gemini untuk ketikan, petunjuk kantong & “+ Buat kantong” (A-1), kalimat pindah (B-6), B-4/B-5 dari hasil baca tiruan, periksa dulu (draft + konfirmasi, syarat Simpan semua, Simpan bersama, Urungkan), isi jejak “Cara dicatat”");
