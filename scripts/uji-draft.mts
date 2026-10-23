/**
 * Uji catat sebagai obrolan (src/lib/draft.ts).
 *
 * Pemakaian: npm run uji:draft
 */
import assert from "node:assert/strict";
import { apakahKoreksi, bacaNominal, bacaTenor, kantongDariJawaban, mauHapus, pertanyaanDraft } from "../src/lib/draft.ts";

const d = (t: Partial<Parameters<typeof pertanyaanDraft>[0]>) =>
  pertanyaanDraft({ status: "needs_review", amount: 0, type: "expense", category: "other", merchant: null, kantong_id: null, kantong_tujuan_id: null, ...t });

// Urutan pertanyaan: cerita / nominal → kantong → tujuan → konfirmasi.
assert.equal(d({}), "cerita");
assert.equal(d({ merchant: "SPBU" }), "nominal");
assert.equal(d({ category: "transport" }), "nominal");
assert.equal(d({ amount: 20000 }), "kantong");
assert.equal(d({ amount: "20000.00", kantong_id: "k1" }), "konfirmasi");
assert.equal(d({ amount: 50000, type: "transfer", kantong_id: "k1" }), "kantong_tujuan");
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

console.log("✓ draft: urutan pertanyaan, nominal ketikan (rb/jt/Rp/titik), kantong dari chip & kalimat, koreksi vs catatan baru, minta hapus, tenor paylater");
