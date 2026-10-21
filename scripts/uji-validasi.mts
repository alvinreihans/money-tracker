/**
 * Uji validasi transaksi yang diisi tangan (src/lib/transaksi-input.ts).
 *
 * Pemakaian: npm run uji:validasi
 */
import assert from "node:assert/strict";
import { bersihkanCari, rapikanBudget, validasiKantong, validasiTransaksi } from "../src/lib/transaksi-input.ts";

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
  kantong_id: null,
  kantong_tujuan_id: null,
  description: null,
});

// Kantong: id harus uuid; tujuan hanya untuk pindah kantong dan tidak boleh sama dengan asal.
const ID_A = "0b6c1b1e-6f3a-4d2b-9c1e-3a7f0e2d4c5b";
const ID_B = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
const pindah = validasiTransaksi({ ...sah, type: "transfer", kantong_id: ID_A, kantong_tujuan_id: ID_B });
assert.ok(pindah.ok && pindah.data.kantong_tujuan_id === ID_B);
const keluar = validasiTransaksi({ ...sah, kantong_id: ID_A, kantong_tujuan_id: ID_B });
assert.ok(keluar.ok && keluar.data.kantong_id === ID_A && keluar.data.kantong_tujuan_id === null);

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
  ["kantong bukan uuid", { ...sah, kantong_id: "bca" }],
  ["kantong asal = tujuan", { ...sah, type: "transfer", kantong_id: ID_A, kantong_tujuan_id: ID_A }],
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

// Kantong: saldo awal kosong = 0, boleh minus; nama & tanggal wajib.
const kantong = { name: "  GoPay ", kind: "ewallet", saldo_awal: "", saldo_per: "2026-10-01" };
assert.deepEqual(validasiKantong(kantong), {
  ok: true,
  data: { name: "GoPay", kind: "ewallet", saldo_awal: 0, saldo_per: "2026-10-01" },
});
const minus = validasiKantong({ ...kantong, saldo_awal: "-250000" });
assert.ok(minus.ok && minus.data.saldo_awal === -250000);
for (const salah of [
  { ...kantong, name: "  " },
  { ...kantong, name: "x".repeat(41) },
  { ...kantong, kind: "kripto" },
  { ...kantong, saldo_awal: "sejuta" },
  { ...kantong, saldo_awal: 1e12 },
  { ...kantong, saldo_per: "2026-02-30" },
]) {
  assert.equal(validasiKantong(salah).ok, false, JSON.stringify(salah));
}

console.log(`✓ validasi transaksi: 1 sah + ${tolak.length} tolak; teks cari aman; budget; kantong`);
