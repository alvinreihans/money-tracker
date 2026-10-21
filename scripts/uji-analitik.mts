/**
 * Uji perhitungan analitik Beranda (src/lib/analitik.ts).
 *
 * Pemakaian: npm run uji:analitik
 */
import assert from "node:assert/strict";
import { hitungStreak, trenBulanan } from "../src/lib/analitik.ts";

// 22 Okt 2026, 10.00 WIB.
const sekarang = new Date("2026-10-22T03:00:00Z");

// --- Tren bulanan ---
const tren = trenBulanan(
  [
    { amount: 8000000, type: "income", transaction_date: "2026-10-01" },
    { amount: "20000.00", type: "expense", transaction_date: "2026-10-21" },
    { amount: 200000, type: "transfer", transaction_date: "2026-10-05" }, // bukan masuk/keluar
    { amount: 50000, type: "expense", transaction_date: "2026-05-31" },
    { amount: 999, type: "expense", transaction_date: "2026-04-30" }, // di luar 6 bulan
  ],
  sekarang,
);
assert.deepEqual(tren.map((b) => b.kunci), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
assert.equal(tren[0].label, "Mei");
assert.deepEqual(tren[5], { kunci: "2026-10", label: "Okt", masuk: 8000000, keluar: 20000, sisa: 7980000 });
assert.equal(tren[0].keluar, 50000);
// Lintas tahun: Februari 2027 mundur sampai September 2026.
assert.deepEqual(trenBulanan([], new Date("2027-02-10T03:00:00Z")).map((b) => b.kunci), [
  "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02",
]);

// --- Streak ---
const wib = (tgl: string, jam = "10:00") => new Date(`${tgl}T${jam}:00+07:00`).toISOString();
assert.deepEqual(hitungStreak([wib("2026-10-22"), wib("2026-10-21"), wib("2026-10-20"), wib("2026-10-18")], sekarang), {
  hari: 3,
  hariIni: true,
});
// Belum mencatat hari ini, tapi kemarin ada: streak masih hidup.
assert.deepEqual(hitungStreak([wib("2026-10-21"), wib("2026-10-20")], sekarang), { hari: 2, hariIni: false });
// Terakhir mencatat dua hari lalu: putus.
assert.deepEqual(hitungStreak([wib("2026-10-20")], sekarang), { hari: 0, hariIni: false });
// 00.30 WIB tanggal 22 = 21 Okt 17.30 UTC: tetap dihitung tanggal 22.
assert.deepEqual(hitungStreak([wib("2026-10-22", "00:30"), wib("2026-10-21")], sekarang), { hari: 2, hariIni: true });
assert.deepEqual(hitungStreak([], sekarang), { hari: 0, hariIni: false });

console.log("✓ analitik: tren bulanan, streak");
