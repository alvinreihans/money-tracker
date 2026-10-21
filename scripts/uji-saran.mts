/**
 * Uji saran di kolom "Catat" (src/lib/saran.ts).
 *
 * Pemakaian: npm run uji:saran
 */
import assert from "node:assert/strict";
import { nominalRingkas, saranCatat } from "../src/lib/saran.ts";

assert.equal(nominalRingkas(20000), "20rb");
assert.equal(nominalRingkas(2_000_000), "2jt");
assert.equal(nominalRingkas(1_500_000), "1500rb");
assert.equal(nominalRingkas(12500), "12500");
assert.equal(nominalRingkas(500), "500");

const baris = [
  { merchant: "Warteg Bahari", amount: 20000, payment_method: "Tunai" },
  { merchant: "warteg bahari", amount: "20000.00", payment_method: "tunai" }, // duplikat beda huruf
  { merchant: "Kopi Kenangan", amount: 25000, payment_method: null },
  { merchant: null, amount: 10000, payment_method: "QRIS" }, // tanpa nama: tidak berguna sebagai saran
  { merchant: "Parkir", amount: 0, payment_method: null }, // nominal kosong
  { merchant: "Warteg Bahari", amount: 22000, payment_method: "Tunai" }, // nominal beda: saran sendiri
];

assert.deepEqual(saranCatat(baris), ["Warteg Bahari 20rb Tunai", "Kopi Kenangan 25rb", "Warteg Bahari 22rb Tunai"]);
assert.deepEqual(saranCatat(baris, 1), ["Warteg Bahari 20rb Tunai"]);
assert.deepEqual(saranCatat([]), []);

console.log("✓ saran catat: format nominal, buang duplikat & baris tak berguna, batas jumlah");
