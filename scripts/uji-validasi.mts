/**
 * Uji validasi transaksi yang diisi tangan (src/lib/transaksi-input.ts).
 *
 * Pemakaian: npm run uji:validasi
 */
import assert from "node:assert/strict";
import { bersihkanCari, rapikanBudget, validasiTransaksi } from "../src/lib/transaksi-input.ts";

const sah = {
  amount: "25000",
  type: "expense",
  category: "food",
  transaction_date: "2026-10-21",
  merchant: "  Kopi Kenangan ",
  payment_method: "",
  description: undefined,
};

const hasil = validasiTransaksi(sah);
assert.ok(hasil.ok, "input sah harus lolos");
assert.deepEqual(hasil.data, {
  amount: 25000,
  type: "expense",
  category: "food",
  transaction_date: "2026-10-21",
  merchant: "Kopi Kenangan",
  payment_method: null,
  description: null,
});

const tolak: Array<[string, Record<string, unknown>]> = [
  ["nominal kosong", { ...sah, amount: "" }],
  ["nominal nol", { ...sah, amount: 0 }],
  ["nominal negatif", { ...sah, amount: -5 }],
  ["nominal bukan angka", { ...sah, amount: "dua puluh" }],
  ["nominal kebesaran", { ...sah, amount: 1e12 }],
  ["jenis asing", { ...sah, type: "refund" }],
  ["kategori asing", { ...sah, category: "judi" }],
  ["tanggal format salah", { ...sah, transaction_date: "21/10/2026" }],
  ["tanggal tidak ada", { ...sah, transaction_date: "2026-02-30" }],
  ["merchant bukan teks", { ...sah, merchant: 123 }],
  ["keterangan kepanjangan", { ...sah, description: "x".repeat(501) }],
];

for (const [nama, input] of tolak) {
  assert.equal(validasiTransaksi(input).ok, false, `harus ditolak: ${nama}`);
}

// Teks cari: karakter sintaks PostgREST dibuang, teks biasa utuh.
assert.equal(bersihkanCari("  kopi  kenangan "), "kopi kenangan");
assert.equal(bersihkanCari("x),merchant.eq.y"), "x merchant.eq.y");
assert.equal(bersihkanCari("50%*"), "50");
assert.equal(bersihkanCari('a\\b"c:d'), "a b c d");
assert.equal(bersihkanCari(undefined), "");
assert.equal(bersihkanCari("x".repeat(80)).length, 50);

// Budget: kosong = hapus target, isi = simpan (dibulatkan ke rupiah).
assert.deepEqual(rapikanBudget({ food: "1500000", transport: " ", bills: "250000.4" }), {
  ok: true,
  simpan: [
    { category: "food", amount: 1500000 },
    { category: "bills", amount: 250000 },
  ],
  hapus: ["transport"],
});
assert.equal(rapikanBudget({ food: "0" }).ok, false);
assert.equal(rapikanBudget({ food: "-5" }).ok, false);
assert.equal(rapikanBudget({ food: "1e12" }).ok, false);
assert.equal(rapikanBudget({ judi: "5000" }).ok, false);

console.log(`✓ validasi transaksi: 1 sah + ${tolak.length} tolak; teks cari aman; budget`);
