/**
 * Uji ingat kategori per merchant (SPEC-ingat-kategori): normalisasi nama,
 * nama terpotong, jenis berbeda, yang terbaru menang, "Lainnya" tidak diingat.
 */
import assert from "node:assert/strict";
import { ingatKategori, kunciMerchant, merchantSama, type BarisIngat } from "../src/lib/ingat.ts";

// --- Normalisasi & cocok
assert.equal(kunciMerchant("WAITENJOY.CO"), "waitenjoyco");
assert.equal(kunciMerchant("  Dnid Ridx Dana "), "dnidridxdana");
assert.equal(kunciMerchant(null), "");
assert.ok(merchantSama("WAITENJOY.CO", "waitenjoy co"));
assert.ok(merchantSama("WAITENJOY.CO", "WAITENJOY.COM"), "terpotong tetap cocok");
assert.ok(merchantSama("waitenjoy", "WAITENJOY.COM"));
assert.ok(merchantSama("Dnid Ridx Dana", "DNID RIDX DANA"));
assert.ok(!merchantSama("Kopi", "Kopi Kenangan"), "awalan terlalu pendek");
// AI membuang kata depan: semua kata nama pendek ada di nama panjang.
assert.ok(merchantSama("qwrtz", "Toko Qwrtz"));
assert.ok(merchantSama("Indomaret", "INDOMARET POINT"));
assert.ok(!merchantSama("Dana", "Dnid Ridx Dana"), "kata terlalu pendek");
assert.ok(!merchantSama("Toko Qwrtz", "Toko Abcde"), "hanya sebagian kata yang sama");
assert.ok(!merchantSama("Indomaret", "Alfamart"));
assert.ok(!merchantSama("", "Alfamart"));
assert.ok(!merchantSama(null, null));

// --- Ingat: transaksi terakhir (urutan baris = terbaru dulu), jenis sama, bukan Lainnya
const baris: BarisIngat[] = [
  { merchant: "Dnid Ridx Dana", category: "other", type: "expense" },
  { merchant: "WAITENJOY.CO", category: "c-laundry", kelompok: "kebutuhan", type: "expense" },
  { merchant: "Waitenjoy", category: "food", type: "expense" },
  { merchant: "Dnid Ridx Dana", category: "food", type: "expense" },
  { merchant: "Kantor", category: "salary", type: "income" },
];
assert.deepEqual(ingatKategori(baris, "WAITENJOY.COM", "expense"), { category: "c-laundry", kelompok: "kebutuhan" }, "yang terbaru menang");
assert.deepEqual(ingatKategori(baris, "DNID RIDX DANA", "expense"), { category: "food", kelompok: null }, "Lainnya dilewati");
assert.equal(ingatKategori(baris, "Kantor", "expense"), null, "jenis berbeda tidak dipakai");
assert.deepEqual(ingatKategori(baris, "kantor", "income"), { category: "salary", kelompok: null });
assert.equal(ingatKategori(baris, "Laundry Baru", "expense"), null, "merchant baru: ikut tebakan AI");
assert.equal(ingatKategori([{ merchant: "X Mart", category: "other", type: "expense" }], "X Mart", "expense"), null);

console.log("✓ ingat kategori: normalisasi merchant, nama terpotong, awalan terlalu pendek, jenis sama, yang terbaru menang, Lainnya tidak diingat");
