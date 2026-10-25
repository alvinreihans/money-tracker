/**
 * Uji metode budgeting (SPEC-metode-budget): wadah tiap preset, persen
 * kustom, basis pemasukan, realisasi per kelompok, tabungan dari sisa, status.
 */
import assert from "node:assert/strict";
import { cekPersen, hitungMetode, pemasukanBasis, wadahMetode, type BarisMetode } from "../src/lib/metode.ts";

// --- Wadah
assert.deepEqual(wadahMetode("50-30-20").map((w) => [w.id, w.persen]), [["kebutuhan", 50], ["keinginan", 30], ["tabungan", 20]]);
assert.deepEqual(wadahMetode("80-20").map((w) => w.persen), [80, 20]);
assert.deepEqual(wadahMetode("70-20-10").map((w) => [w.id, w.persen]), [["biaya-hidup", 70], ["tabungan", 20], ["berbagi", 10]]);
assert.ok(wadahMetode("50-30-20")[0].kelompok.includes("berbagi"), "berbagi ikut kebutuhan di 50/30/20");
assert.deepEqual(wadahMetode("kustom", { kebutuhan: 60, keinginan: 20, tabungan: 20 }).map((w) => w.id), ["kebutuhan", "keinginan", "tabungan"], "0% tidak tampil");
assert.deepEqual(wadahMetode("kategori"), []);

// --- Persen kustom
assert.ok(cekPersen({ kebutuhan: 50, keinginan: 30, tabungan: 15, berbagi: 5 }).ok);
const kurang = cekPersen({ kebutuhan: 50, keinginan: 30, tabungan: 10 });
assert.ok(!kurang.ok && /90%/.test(kurang.error));
assert.ok(!cekPersen({ kebutuhan: 50.5, keinginan: 49.5 }).ok);
assert.ok(!cekPersen({ kebutuhan: 120, keinginan: -20 }).ok);

// --- Basis: tanpa cashback/refund, hanya yang sudah selesai
const ini: BarisMetode[] = [
  { type: "income", category: "salary", amount: 8000000 },
  { type: "income", category: "refund", amount: 50000 },
  { type: "income", category: "bonus", amount: 2000000, status: "needs_review" },
  { type: "expense", category: "food", amount: 3000000, kelompok_efektif: "kebutuhan" },
  { type: "expense", category: "shopping", amount: 2900000, kelompok_efektif: "keinginan" },
  { type: "expense", category: "other", amount: 300000, kelompok_efektif: "berbagi" },
  { type: "expense", category: "other", amount: 1000000, kelompok_efektif: "tabungan" },
  { type: "expense", category: "food", amount: 999999, kelompok_efektif: "keinginan", status: "needs_review" },
  { type: "transfer", category: "other", amount: 500000 },
];
assert.equal(pemasukanBasis(ini), 8000000);

// --- 50/30/20: kebutuhan 3,3 jt (termasuk berbagi), keinginan 2,9 jt, tabungan = 8 jt − 6,2 jt = 1,8 jt
const h = hitungMetode({ metode: "50-30-20" }, ini)!;
assert.equal(h.basis, 8000000);
assert.equal(h.basisBulanLalu, false);
const [keb, kei, tab] = h.wadah;
assert.deepEqual([keb.target, keb.realisasi, keb.status], [4000000, 3300000, "hampir"]);
assert.deepEqual([kei.target, kei.realisasi, kei.terpakai, kei.status], [2400000, 2900000, 121, "lewat"]);
assert.deepEqual([tab.target, tab.realisasi, tab.status, tab.tabungan], [1600000, 1800000, "tercapai", true]);

// --- 70/20/10: berbagi wadah sendiri
const h7 = hitungMetode({ metode: "70-20-10" }, ini)!;
assert.deepEqual(h7.wadah.map((w) => [w.id, w.realisasi]), [["biaya-hidup", 5900000], ["tabungan", 1800000], ["berbagi", 300000]]);

// --- Awal bulan tanpa pemasukan: basis bulan lalu
const awal = hitungMetode({ metode: "80-20" }, [{ type: "expense", category: "food", amount: 100000, kelompok_efektif: "kebutuhan" }], [{ type: "income", category: "salary", amount: 6000000 }])!;
assert.equal(awal.basis, 6000000);
assert.equal(awal.basisBulanLalu, true);
assert.equal(awal.wadah[0].target, 4800000);
// Tanpa pemasukan sama sekali: target 0, ada pengeluaran → 100% terpakai.
const kosong = hitungMetode({ metode: "50-30-20" }, [{ type: "expense", category: "food", amount: 1, kelompok_efektif: "kebutuhan" }])!;
assert.equal(kosong.wadah[0].target, 0);
assert.equal(kosong.wadah[2].realisasi, 0, "tabungan tidak negatif");
assert.equal(hitungMetode({ metode: "kategori" }, ini), null);

console.log("✓ metode budgeting: wadah preset & kustom, persen 100%, basis tanpa refund (cadangan bulan lalu), realisasi per kelompok, tabungan dari sisa, status");
