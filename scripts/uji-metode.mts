/**
 * Uji metode budgeting (SPEC-metode-budget): wadah tiap preset, persen
 * kustom, saran penghasilan, realisasi per kelompok, tabungan dari sisa,
 * status, pengeluaran dari tujuan tabungan (SPEC-tujuan-tabungan).
 */
import assert from "node:assert/strict";
import { cekPersen, hitungMetode, KELOMPOK, KELOMPOK_KUSTOM, saranPenghasilan, setoranBersih, wadahMetode, type BarisMetode } from "../src/lib/metode.ts";
import { progresTujuan } from "../src/lib/tujuan.ts";

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

// --- Saran penghasilan: rerata bulan penuh yang ada penghasilannya; uang masuk lain tidak dihitung
const penghasilan = new Set(["salary", "bonus", "business", "freelance"]);
const masuk = [
  // Gajian akhir bulan: Juli, Agustus, September masing-masing sekali.
  { category: "salary", amount: 8000000, transaction_date: "2026-07-28" },
  { category: "salary", amount: 8000000, transaction_date: "2026-08-28" },
  { category: "salary", amount: 8500000, transaction_date: "2026-09-28" },
  { category: "gift", amount: 500000, transaction_date: "2026-09-10" },
  { category: "refund", amount: 358211, transaction_date: "2026-10-05" },
  { category: "other", amount: 500000, transaction_date: "2026-10-12" },
];
assert.deepEqual(saranPenghasilan(masuk, penghasilan, "2026-10"), { nilai: 8166667, sumber: "rerata", bulan: 3 }, "Oktober belum gajian tetap memakai rerata");
// Gaji bergeser lebih awal karena akhir pekan: September kosong, Oktober dua kali → tetap satu gaji per bulan.
assert.deepEqual(
  saranPenghasilan([{ category: "salary", amount: 8000000, transaction_date: "2026-08-28" }, { category: "salary", amount: 8000000, transaction_date: "2026-10-01" }], penghasilan, "2026-10"),
  { nilai: 8000000, sumber: "rerata", bulan: 1 },
);
// User baru: belum ada sebulan penuh → bulan ini.
assert.deepEqual(saranPenghasilan([{ category: "freelance", amount: 3000000, transaction_date: "2026-10-03" }], penghasilan, "2026-10"), { nilai: 3000000, sumber: "bulan-ini", bulan: 1 });
assert.deepEqual(saranPenghasilan([{ category: "gift", amount: 3000000, transaction_date: "2026-10-03" }], penghasilan, "2026-10"), { nilai: 0, sumber: "kosong", bulan: 0 });

// --- Realisasi: hanya yang sudah selesai; pemasukan & transfer tidak dihitung
const ini: BarisMetode[] = [
  { type: "income", category: "salary", amount: 8000000 },
  { type: "expense", category: "food", amount: 3000000, kelompok_efektif: "kebutuhan" },
  { type: "expense", category: "shopping", amount: 2900000, kelompok_efektif: "keinginan" },
  { type: "expense", category: "other", amount: 300000, kelompok_efektif: "berbagi" },
  { type: "expense", category: "other", amount: 1000000, kelompok_efektif: "tabungan" },
  { type: "expense", category: "food", amount: 999999, kelompok_efektif: "keinginan", status: "needs_review" },
  { type: "transfer", category: "other", amount: 500000 },
];

// --- 50/30/20 dari penghasilan 8 jt: kebutuhan 3,3 jt (termasuk berbagi), keinginan 2,9 jt, tabungan = 8 jt − 6,2 jt = 1,8 jt
const h = hitungMetode({ metode: "50-30-20", persen: null, penghasilan: 8000000 }, ini)!;
assert.equal(h.basis, 8000000);
const [keb, kei, tab] = h.wadah;
assert.deepEqual([keb.target, keb.realisasi, keb.status], [4000000, 3300000, "hampir"]);
assert.deepEqual([kei.target, kei.realisasi, kei.terpakai, kei.status], [2400000, 2900000, 121, "lewat"]);
assert.deepEqual([tab.target, tab.realisasi, tab.status, tab.tabungan], [1600000, 1800000, "tercapai", true]);
assert.deepEqual([h.dariTujuan, h.keTujuan], [[], 0]);

// --- 70/20/10: berbagi wadah sendiri
const h7 = hitungMetode({ metode: "70-20-10", persen: null, penghasilan: 8000000 }, ini)!;
assert.deepEqual(h7.wadah.map((w) => [w.id, w.realisasi]), [["biaya-hidup", 5900000], ["tabungan", 1800000], ["berbagi", 300000]]);

// --- Beli HP Rp 10,3 jt dari tujuan tabungan: di luar semua wadah, tabungan tidak berkurang
const hp = hitungMetode(
  { metode: "50-30-20", persen: null, penghasilan: 8000000, tujuan: [{ id: "t-hp", nama: "HP baru" }], keTujuan: 500000 },
  [...ini, { type: "expense", category: "shopping", amount: 10300000, kelompok_efektif: "keinginan", kantong_id: "t-hp" }],
)!;
assert.deepEqual(hp.wadah.map((w) => w.realisasi), [3300000, 2900000, 1800000]);
assert.deepEqual(hp.dariTujuan, [{ nama: "HP baru", jumlah: 10300000 }]);
assert.equal(hp.keTujuan, 500000);

// Tanpa penghasilan sama sekali: target 0, ada pengeluaran → 100% terpakai.
const kosong = hitungMetode({ metode: "50-30-20", persen: null, penghasilan: 0 }, [{ type: "expense", category: "food", amount: 1, kelompok_efektif: "kebutuhan" }])!;
assert.equal(kosong.wadah[0].target, 0);
assert.equal(kosong.wadah[2].realisasi, 0, "tabungan tidak negatif");
assert.equal(hitungMetode({ metode: "kategori", persen: null, penghasilan: 8000000 }, ini), null);

// --- Kelompok baru (SPEC-kelompok-baru): Pengembangan diri & Tak terduga dihitung Kebutuhan di metode persentase
assert.equal(KELOMPOK.length, 6);
assert.deepEqual([...KELOMPOK_KUSTOM], ["kebutuhan", "keinginan", "tabungan", "berbagi"], "isian kustom tetap empat");
const baru: BarisMetode[] = [
  ...ini,
  { type: "expense", category: "education", amount: 400000, kelompok_efektif: "pengembangan" },
  { type: "expense", category: "transport", amount: 600000, kelompok_efektif: "tak_terduga" },
];
// Sama persis dengan bila 1 jt itu berkelompok kebutuhan.
const sebagaiKebutuhan: BarisMetode[] = [...ini, { type: "expense", category: "food", amount: 1000000, kelompok_efektif: "kebutuhan" }];
for (const [metode, persen] of [["50-30-20", null], ["80-20", null], ["70-20-10", null], ["kustom", { kebutuhan: 60, keinginan: 20, tabungan: 15, berbagi: 5 }]] as const) {
  const a = hitungMetode({ metode, persen, penghasilan: 8000000 }, baru)!;
  const b = hitungMetode({ metode, persen, penghasilan: 8000000 }, sebagaiKebutuhan)!;
  assert.deepEqual(a.wadah.map((w) => [w.id, w.realisasi]), b.wadah.map((w) => [w.id, w.realisasi]), metode);
}
// Kustom: wadah kelompok baru tidak muncul walau 0% (dulu kelompok 0% dibuang beserta pengeluarannya).
assert.deepEqual(wadahMetode("kustom", { kebutuhan: 80, tabungan: 20 }).map((w) => w.id), ["kebutuhan", "tabungan"]);
assert.ok(cekPersen({ kebutuhan: 50, keinginan: 30, tabungan: 20, pengembangan: 10 } as never).ok, "kelompok di luar empat diabaikan cekPersen");

// --- Setoran bersih ke tujuan (SPEC-metode-lanjutan): setor − tarik; antar-tujuan tidak dihitung
const idTujuan = new Set(["t-a", "t-b"]);
assert.equal(
  setoranBersih(
    [
      { amount: 1000000, kantong_id: "bca", kantong_tujuan_id: "t-a" },
      { amount: 400000, kantong_id: "t-a", kantong_tujuan_id: "bca" },
      { amount: 300000, kantong_id: "t-a", kantong_tujuan_id: "t-b" },
      { amount: 50000, kantong_id: "bca", kantong_tujuan_id: "gopay" },
    ],
    idTujuan,
  ),
  600000,
);
assert.equal(setoranBersih([{ amount: 500000, kantong_id: "t-a", kantong_tujuan_id: "bca" }], idTujuan), -500000, "lebih banyak ditarik");

// --- Pay Yourself First 20%: tabungan = setoran nyata (600 rb ke tujuan + 1 jt emas), bukan sisa
const pyf = hitungMetode({ metode: "pyf", persen: { tabungan: 20 }, penghasilan: 8000000, keTujuan: 600000 }, ini)!;
assert.deepEqual(pyf.wadah.map((w) => [w.id, w.target, w.realisasi, w.status]), [
  ["tabungan", 1600000, 1600000, "tercapai"],
  ["bebas", 6400000, 6200000, "aman"],
], "97% Bebas dipakai tetap aman, tanpa 'hampir'");
const pyfLewat = hitungMetode({ metode: "pyf", persen: { tabungan: 20 }, penghasilan: 8000000 }, [...ini, { type: "expense", category: "shopping", amount: 300000, kelompok_efektif: "keinginan" }])!;
assert.deepEqual(pyfLewat.wadah.map((w) => [w.id, w.realisasi, w.status]), [["tabungan", 1000000, "kurang"], ["bebas", 6500000, "lewat"]]);
assert.equal(wadahMetode("pyf", null)[0].persen, 20, "bawaan 20%");

// --- 6 Jars: toples tabungan jangka panjang = setoran ke tujuan, kebebasan finansial = beli emas/reksadana
const jars = hitungMetode({ metode: "6-jars", persen: null, penghasilan: 8000000, keTujuan: 600000 }, baru)!;
assert.deepEqual(jars.wadah.map((w) => [w.id, w.target, w.realisasi, w.status]), [
  ["kebutuhan", 4400000, 3600000, "hampir"],
  ["hiburan", 800000, 2900000, "lewat"],
  ["pendidikan", 800000, 400000, "aman"],
  ["tabungan-panjang", 800000, 600000, "kurang"],
  ["kebebasan", 800000, 1000000, "tercapai"],
  ["berbagi", 400000, 300000, "aman"],
]);
assert.equal(wadahMetode("6-jars").reduce((n, w) => n + w.persen, 0), 100);

// --- Kakeibo: empat pos tanpa jatah (porsi dari total belanja), target tabungan rupiah
const kak = hitungMetode({ metode: "kakeibo", persen: null, penghasilan: 8000000, keTujuan: 600000, targetTabungan: 1500000 }, baru)!;
assert.deepEqual(kak.wadah.map((w) => [w.id, w.realisasi, w.terpakai, w.status]), [
  ["bertahan", 3300000, 46, "aman"],
  ["pilihan", 2900000, 40, "aman"],
  ["budaya", 400000, 6, "aman"],
  ["ekstra", 600000, 8, "aman"],
  ["tabungan", 1600000, 107, "tercapai"],
]);
assert.deepEqual(kak.kakeibo, { bisaDibelanjakan: 6500000, dibelanjakan: 7200000, sisa: -700000 });

// --- Zero-Based: belum dialokasikan = penghasilan − Σ target kategori − tabungan
const zb = (totalTarget: number, targetTabungan: number | null) =>
  hitungMetode({ metode: "zero-based", persen: null, penghasilan: 8000000, keTujuan: 600000, totalTarget, targetTabungan }, ini)!;
assert.equal(zb(5000000, 1500000).belumDialokasikan, 1500000);
assert.equal(zb(6000000, 2000000).belumDialokasikan, 0);
assert.equal(zb(7000000, 2000000).belumDialokasikan, -1000000);
assert.deepEqual(zb(6000000, 2000000).wadah.map((w) => [w.id, w.target, w.realisasi, w.status]), [["tabungan", 2000000, 1600000, "kurang"]]);
// Metode lama tidak punya isian metode lanjutan.
assert.equal(h.belumDialokasikan, undefined);
assert.equal(h.kakeibo, undefined);

// --- Progres tujuan
assert.deepEqual(progresTujuan({ target: 10000000, tenggat: "2027-03-31", saldo: 6000000 }, "2026-10-25"), {
  terkumpul: 6000000, sisa: 4000000, persen: 60, tercapai: false, perBulan: 666667, telat: false,
}, "Oktober s.d. Maret = 6 bulan");
assert.equal(progresTujuan({ target: 10000000, tenggat: "2026-10-31", saldo: 0 }, "2026-10-25").perBulan, 10000000, "tenggat bulan ini");
assert.deepEqual(progresTujuan({ target: 10000000, tenggat: "2026-09-30", saldo: 2000000 }, "2026-10-25").telat, true);
const capai = progresTujuan({ target: 10000000, tenggat: "2026-09-30", saldo: 10300000 }, "2026-10-25");
assert.deepEqual([capai.tercapai, capai.persen, capai.sisa, capai.telat, capai.perBulan], [true, 100, 0, false, null]);
assert.deepEqual(progresTujuan({ target: 5000000, saldo: -100 }, "2026-10-25").terkumpul, 0);

console.log("✓ metode budgeting: wadah preset & kustom, persen 100%, saran penghasilan (gajian akhir bulan, uang masuk bukan penghasilan), realisasi per kelompok, tabungan dari sisa, status, pengeluaran dari tujuan tabungan, progres tujuan; kelompok baru; setoran bersih; PYF, 6 Jars, Kakeibo, Zero-Based");
