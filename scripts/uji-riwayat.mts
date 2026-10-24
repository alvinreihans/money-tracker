/**
 * Uji filter Riwayat (src/lib/riwayat.ts, SPEC-riwayat-filter).
 *
 * Pemakaian: npm run uji:riwayat
 */
import assert from "node:assert/strict";
import { adaFilter, alamatRiwayat, bacaFilter, FILTER_KOSONG, rentangTanggal, ringkasRiwayat } from "../src/lib/riwayat.ts";

const K1 = "0b6c1b1e-6f3a-4d2b-9c1e-3a7f0e2d4c5b";
const K2 = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
const sah = { kantong: [K1, K2], kategori: ["expense:food", "expense:transport", "income:salary"] };

// Kosong → bawaan.
assert.deepEqual(bacaFilter({}, sah), FILTER_KOSONG);
assert.equal(adaFilter(FILTER_KOSONG), false);

// Nilai sah terbaca; yang asing dibuang (id kantong orang lain, kategori karangan, jenis aneh).
const f = bacaFilter({ jenis: "keluar", periode: "bulan-ini", kantong: `${K1},bukan-uuid,${K1}`, kategori: "expense:food,expense:judi,income:salary", q: "kopi)" }, sah);
assert.deepEqual(f, { jenis: "keluar", q: "kopi", periode: "bulan-ini", dari: null, sampai: null, kantong: [K1], kategori: ["expense:food", "income:salary"] });
assert.equal(adaFilter(f), true);
assert.equal(bacaFilter({ jenis: "semuanya" }, sah).jenis, "semua");
assert.equal(bacaFilter({ periode: "tahun-ini" }, sah).periode, null);

// Rentang sendiri: tanggal harus sungguhan; terbalik ditukar; diabaikan kalau ada periode.
assert.deepEqual(rentangTanggal(bacaFilter({ dari: "2026-10-15", sampai: "2026-10-01" }, sah), "2026-10-24"), { dari: "2026-10-01", sampai: "2026-10-15" });
assert.equal(bacaFilter({ dari: "2026-02-30" }, sah).dari, null);
assert.equal(bacaFilter({ dari: "24/10/2026" }, sah).dari, null);
assert.equal(bacaFilter({ periode: "hari-ini", dari: "2026-10-01" }, sah).dari, null);

// Periode cepat (WIB), termasuk batas bulan & tahun.
const r = (periode: string, hariIni: string) => rentangTanggal(bacaFilter({ periode }, sah), hariIni);
assert.deepEqual(r("hari-ini", "2026-10-24"), { dari: "2026-10-24", sampai: "2026-10-24" });
assert.deepEqual(r("7-hari", "2026-10-03"), { dari: "2026-09-27", sampai: "2026-10-03" });
assert.deepEqual(r("bulan-ini", "2026-02-10"), { dari: "2026-02-01", sampai: "2026-02-28" });
assert.deepEqual(r("bulan-lalu", "2026-01-05"), { dari: "2025-12-01", sampai: "2025-12-31" });
assert.deepEqual(r("bulan-lalu", "2026-03-31"), { dari: "2026-02-01", sampai: "2026-02-28" });
assert.deepEqual(rentangTanggal(FILTER_KOSONG, "2026-10-24"), { dari: null, sampai: null });

// Alamat: hanya yang aktif, koma & titik dua dibiarkan terbaca; bolak-balik utuh.
assert.equal(alamatRiwayat(FILTER_KOSONG), "/riwayat");
const alamat = alamatRiwayat(f);
assert.equal(alamat, `/riwayat?jenis=keluar&periode=bulan-ini&kantong=${K1}&kategori=expense:food,income:salary&q=kopi`);
assert.deepEqual(bacaFilter(Object.fromEntries(new URL(alamat, "http://x").searchParams), sah), f);
assert.equal(alamatRiwayat({ ...FILTER_KOSONG, dari: "2026-10-01", sampai: "2026-10-15" }), "/riwayat?dari=2026-10-01&sampai=2026-10-15");

// Total: keluar & masuk per bulan; pindah kantong tidak dihitung.
assert.deepEqual(
  ringkasRiwayat([
    { amount: "12000.00", type: "expense", transaction_date: "2026-10-24" },
    { amount: 50, type: "income", transaction_date: "2026-10-24" },
    { amount: 500000, type: "transfer", transaction_date: "2026-10-20" },
    { amount: 3000, type: "expense", transaction_date: "2026-09-30" },
  ]),
  {
    keluar: 15000,
    masuk: 50,
    perBulan: { "2026-10": { keluar: 12000, masuk: 50 }, "2026-09": { keluar: 3000, masuk: 0 } },
    perHari: { "2026-10-24": { keluar: 12000, masuk: 50 }, "2026-09-30": { keluar: 3000, masuk: 0 } },
  },
);

console.log("✓ riwayat: baca & bersihkan filter URL, rentang periode (batas bulan/tahun), alamat bolak-balik, total per bulan & per hari");
