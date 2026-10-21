/**
 * Uji pencocokan metode bayar ke kantong dan hitungan saldo (src/lib/kantong.ts).
 *
 * Pemakaian: npm run uji:kantong
 */
import assert from "node:assert/strict";
import { alasanDraft, cocokkanKantong, hitungSaldo, type Kantong } from "../src/lib/kantong.ts";

const bca: Kantong = { id: "bca", name: "BCA", kind: "bank", aliases: [], saldo_awal: "1000000.00", saldo_per: "2026-10-01" };
const gopay: Kantong = { id: "gopay", name: "GoPay", kind: "ewallet", aliases: null, saldo_awal: 50000, saldo_per: "2026-10-10" };
const dompet: Kantong = { id: "dompet", name: "Dompet", kind: "cash", aliases: ["Tunai"], saldo_awal: 0, saldo_per: "2026-10-01" };
const daftar = [bca, gopay, dompet];

// --- Pencocokan ---
assert.equal(cocokkanKantong("gopay", daftar)?.id, "gopay");
assert.equal(cocokkanKantong("Go-Pay", daftar)?.id, "gopay"); // alias bawaan
assert.equal(cocokkanKantong("myBCA", daftar)?.id, "bca");
assert.equal(cocokkanKantong(" bca ", daftar)?.id, "bca");
assert.equal(cocokkanKantong("Tunai", daftar)?.id, "dompet"); // alias dari database
assert.equal(cocokkanKantong("Transfer", daftar), null);
assert.equal(cocokkanKantong("BCA Syariah", daftar), null); // tidak boleh "mengandung"
assert.equal(cocokkanKantong(null, daftar), null);
assert.equal(cocokkanKantong("", daftar), null);

// --- Saldo ---
const saldo = hitungSaldo(daftar, [
  { amount: 8000000, type: "income", transaction_date: "2026-10-01", kantong_id: "bca", kantong_tujuan_id: null },
  { amount: "25000", type: "expense", transaction_date: "2026-10-12", kantong_id: "gopay", kantong_tujuan_id: null },
  // Topup GoPay dari BCA: BCA berkurang, GoPay bertambah, total aset tetap.
  { amount: 100000, type: "transfer", transaction_date: "2026-10-15", kantong_id: "bca", kantong_tujuan_id: "gopay" },
  // Sebelum saldo_per GoPay: sudah termasuk di saldo_awal-nya, jadi GoPay tidak dihitung lagi
  // (tapi BCA, yang saldo_per-nya lebih awal, tetap berkurang).
  { amount: 30000, type: "transfer", transaction_date: "2026-10-05", kantong_id: "bca", kantong_tujuan_id: "gopay" },
  { amount: 999, type: "expense", transaction_date: "2026-09-30", kantong_id: "bca", kantong_tujuan_id: null }, // sebelum saldo_per
  { amount: 5000, type: "expense", transaction_date: "2026-10-12", kantong_id: null, kantong_tujuan_id: null }, // tanpa kantong
  { amount: 7000, type: "expense", transaction_date: "2026-10-12", kantong_id: "kantong-orang", kantong_tujuan_id: null },
]);
assert.deepEqual(saldo, [
  { id: "bca", saldo: 1000000 + 8000000 - 100000 - 30000 },
  { id: "gopay", saldo: 50000 - 25000 + 100000 },
  { id: "dompet", saldo: 0 },
]);
assert.deepEqual(hitungSaldo([], []), []);

// --- Alasan draft ---
const d = { status: "needs_review", amount: 500000, type: "income", kantong_id: null, kantong_tujuan_id: null };
assert.equal(alasanDraft(d), "kantong"); // nominal kebaca, kantong tak cocok
assert.equal(alasanDraft({ ...d, amount: 0 }), "baca"); // nominal tak kebaca
assert.equal(alasanDraft({ ...d, type: "transfer", kantong_id: "bca" }), "kantong"); // tujuan belum jelas
assert.equal(alasanDraft({ ...d, kantong_id: "bca" }), "baca");
assert.equal(alasanDraft({ ...d, status: "confirmed" }), null);

console.log("✓ kantong: pencocokan metode bayar, saldo, alasan draft");
