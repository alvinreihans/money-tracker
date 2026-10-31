/**
 * Uji perhitungan analitik Beranda (src/lib/analitik.ts).
 *
 * Pemakaian: npm run uji:analitik
 */
import assert from "node:assert/strict";
import { analisisBulan, hitungStreak, pisahTujuan, progresBudget, trenBulanan } from "../src/lib/analitik.ts";

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

// --- Budget ---
const budget = progresBudget(
  [
    { category: "food", amount: "1000000.00" },
    { category: "transport", amount: 500000 },
    { category: "bills", amount: 200000 },
    { category: "health", amount: 300000 }, // belum ada pengeluaran
  ],
  [
    { category: "food", amount: 600000, type: "expense" },
    { category: "food", amount: "250000", type: "expense" }, // 85% → waspada
    { category: "transport", amount: 400000, type: "expense" }, // tepat 80% → aman
    { category: "bills", amount: 250000, type: "expense" }, // 125% → lewat
    { category: "food", amount: 999999, type: "income" }, // bukan pengeluaran
    { category: "shopping", amount: 70000, type: "expense" }, // tanpa target, tidak tampil
  ],
);
assert.deepEqual(budget.map((b) => [b.kategori, b.status, b.persen]), [
  ["bills", "lewat", 125],
  ["food", "waspada", 85],
  ["transport", "aman", 80],
  ["health", "aman", 0],
]);
assert.equal(budget[0].sisa, -50000);
assert.equal(budget[1].sisa, 150000);
assert.deepEqual(progresBudget([], [{ category: "food", amount: 1 }]), []);

// --- Analitik per bulan (SPEC-analitik-insight) ---
const r = (amount: number, type: string, category: string, merchant: string | null, transaction_date: string) => ({ amount, type, category, merchant, transaction_date });
const okt = [
  r(25000, "expense", "food", "Warteg Selera Bahari", "2026-10-02"),
  r(18000, "expense", "food", "WARTEG  SELERA BAHARI", "2026-10-05"),
  r(17000, "expense", "food", "Warteg Selera Bahari", "2026-10-15"),
  r(245000, "expense", "shopping", "Shopee", "2026-10-15"),
  r(50, "income", "refund", "Cashback", "2026-10-15"),
  r(500000, "transfer", "other", null, "2026-10-10"), // bukan keluar/masuk
  r(5000000, "income", "salary", "Kantor", "2026-10-01"),
  r(12000, "expense", "transport", null, "2026-10-20"),
];
const sep = [r(40000, "expense", "food", "Warteg", "2026-09-10"), r(300000, "expense", "shopping", "Toko", "2026-09-11")];
const a = analisisBulan(okt, sep, { bulan: "2026-10", hariIni: "2026-10-22" });
assert.equal(a.keluar, 317000);
assert.equal(a.masuk, 5000050);
assert.equal(a.keluarLalu, 340000);
assert.equal(a.perubahanKeluar, -7); // 317 rb vs 340 rb
assert.equal(a.proyeksi, Math.round((317000 / 22) * 31));
assert.deepEqual(a.hariBoros, { tanggal: "2026-10-15", total: 262000 });
assert.deepEqual(
  a.kategori.map((k) => [k.kategori, k.total, k.porsi, k.perubahan]),
  [["shopping", 245000, 77, -18], ["food", 60000, 19, 50], ["transport", 12000, 4, null]], // transport baru
);
assert.deepEqual(a.kategoriNaik, { kategori: "food", selisih: 20000, persen: 50 });
// Merchant: huruf besar-kecil & spasi digabung; ejaan terbanyak yang tampil; tanpa nama dilewati.
assert.deepEqual(a.merchant, [
  { nama: "Shopee", total: 245000, kali: 1 },
  { nama: "Warteg Selera Bahari", total: 60000, kali: 3 },
]);
// Proyeksi hanya bulan berjalan dan mulai hari ke-3.
assert.equal(analisisBulan(okt, sep, { bulan: "2026-10", hariIni: "2026-10-02" }).proyeksi, null);
assert.equal(analisisBulan(okt, sep, { bulan: "2026-10", hariIni: "2026-11-05" }).proyeksi, null);
assert.equal(analisisBulan([r(28000, "expense", "food", null, "2026-02-03")], [], { bulan: "2026-02", hariIni: "2026-02-04" }).proyeksi, 196000); // 7 rb/hari × 28
// Bulan lalu kosong: tanpa persen; bulan ini kosong: tanpa sorotan.
const baru = analisisBulan(okt, [], { bulan: "2026-10", hariIni: "2026-10-22" });
assert.equal(baru.perubahanKeluar, null);
assert.deepEqual(baru.kategoriNaik, { kategori: "shopping", selisih: 245000, persen: null });
const kosong = analisisBulan([], sep, { bulan: "2026-10", hariIni: "2026-10-22" });
assert.deepEqual([kosong.keluar, kosong.proyeksi, kosong.hariBoros, kosong.kategori, kosong.kategoriNaik, kosong.merchant], [0, null, null, [], null, []]);

// --- Pembelian dari tujuan tabungan dipisah (SPEC-analitik-tujuan) ---
const tujuan = [{ id: "hp", nama: "Tabungan HP" }, { id: "liburan", nama: "Liburan" }];
const campur = [
  { amount: "10000000", type: "expense", kantong_id: "hp", transaction_date: "2026-10-18" },
  { amount: 500000, type: "expense", kantong_id: "hp", transaction_date: "2026-10-19" },
  { amount: 25000, type: "expense", kantong_id: "bca", transaction_date: "2026-10-18" },
  { amount: 8000000, type: "income", kantong_id: "hp", transaction_date: "2026-10-01" }, // bukan pengeluaran: tetap
  { amount: 30000, type: "expense", kantong_id: null, transaction_date: "2026-10-02" },
];
const pisah = pisahTujuan(campur, tujuan);
assert.deepEqual(pisah.biasa.map((r) => Number(r.amount)), [25000, 8000000, 30000]);
assert.deepEqual(pisah.dariTujuan, [{ id: "hp", nama: "Tabungan HP", total: 10500000 }]);
assert.deepEqual(pisahTujuan(campur, []).biasa.length, 5);

console.log("✓ analitik: tren bulanan, streak, budget, analisis per bulan (sorotan, kategori, merchant, proyeksi), pisah tujuan tabungan");
