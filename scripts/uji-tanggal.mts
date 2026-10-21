/**
 * Uji hitungan tanggal WIB (src/lib/format.ts, src/lib/periode.ts).
 *
 * Pemakaian: npm run uji:tanggal
 */
import assert from "node:assert/strict";
import { geserHari, isoLokal, kelompokWaktu, namaBulan } from "../src/lib/format.ts";
import { rentangBulan } from "../src/lib/periode.ts";

// 21 Okt 2026 jam 01.30 WIB = 20 Okt 18.30 UTC: harus tetap tanggal 21.
const diniHari = new Date("2026-10-20T18:30:00Z");
assert.equal(isoLokal(diniHari), "2026-10-21");
assert.equal(kelompokWaktu("2026-10-21", diniHari), "Hari ini");
assert.equal(kelompokWaktu("2026-10-20", diniHari), "Kemarin");

// 21 Okt 2026 hari Rabu: Senin 19 Okt masih "Minggu ini", Minggu 18 Okt sudah bukan.
assert.equal(kelompokWaktu("2026-10-19", diniHari), "Minggu ini");
assert.equal(kelompokWaktu("2026-10-18", diniHari), "Oktober");
assert.equal(kelompokWaktu("2026-09-30", diniHari), "September");
assert.equal(kelompokWaktu("2025-12-31", diniHari), "2025");
assert.equal(kelompokWaktu("2026-10-25", diniHari), "Mendatang");
// Senin: "Minggu ini" cuma berisi hari itu sendiri, jadi Minggu kemarin = "Kemarin".
const senin = new Date("2026-10-26T03:00:00Z");
assert.equal(kelompokWaktu("2026-10-25", senin), "Kemarin");
assert.equal(kelompokWaktu("2026-10-24", senin), "Oktober");

// Tanggal 1 jam 03.00 WIB: sudah bulan baru, walau di UTC masih bulan lalu.
assert.deepEqual(rentangBulan(new Date("2026-10-31T20:00:00Z")), {
  awalBulanIni: "2026-11-01",
  awalBulanLalu: "2026-10-01",
});
// Januari: bulan lalunya Desember tahun sebelumnya.
assert.deepEqual(rentangBulan(new Date("2027-01-15T05:00:00Z")), {
  awalBulanIni: "2027-01-01",
  awalBulanLalu: "2026-12-01",
});

assert.equal(geserHari("2026-03-01", -1), "2026-02-28");
assert.equal(namaBulan("2026-10-21"), "Oktober");

console.log("✓ tanggal WIB: kelompok waktu, batas bulan, nama bulan");
