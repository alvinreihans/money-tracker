/**
 * Uji filter Riwayat (src/lib/riwayat.ts, SPEC-riwayat-filter).
 *
 * Pemakaian: npm run uji:riwayat
 */
import assert from "node:assert/strict";
import { geserBulan, gridBulan, ketukTanggal } from "../src/lib/kalender.ts";
import {
  adaFilter,
  alamatRiwayat,
  awalKelompokWaktu,
  bacaFilter,
  cocokMerchant,
  FILTER_KOSONG,
  polaMerchant,
  potongHalaman,
  rentangTanggal,
  ringkasRiwayat,
  susunKartu,
  totalKelompokWaktu,
} from "../src/lib/riwayat.ts";
import type { Transaction } from "../src/types/transaction.ts";

const K1 = "0b6c1b1e-6f3a-4d2b-9c1e-3a7f0e2d4c5b";
const K2 = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
const T1 = "11111111-2222-4333-8444-555555555555";
const sah = { kantong: [K1, K2], kategori: ["expense:food", "expense:transport", "income:salary"], tujuan: [T1] };

// Kosong → bawaan.
assert.deepEqual(bacaFilter({}, sah), FILTER_KOSONG);
assert.equal(adaFilter(FILTER_KOSONG), false);

// Nilai sah terbaca; yang asing dibuang (id kantong orang lain, kategori karangan, jenis aneh).
const f = bacaFilter({ jenis: "keluar", periode: "bulan-ini", kantong: `${K1},bukan-uuid,${K1}`, kategori: "expense:food,expense:judi,income:salary", q: "kopi)" }, sah);
assert.deepEqual(f, { jenis: "keluar", q: "kopi", periode: "bulan-ini", dari: null, sampai: null, kantong: [K1], kategori: ["expense:food", "income:salary"], kelompok: [], merchant: "", tujuan: null, idTujuan: [] });
assert.equal(adaFilter(f), true);
// Kelompok budgeting (SPEC-metode-budget): hanya keempat kelompok; ikut ke alamat.
const fk = bacaFilter({ kelompok: "keinginan,mewah,kebutuhan" }, sah);
assert.deepEqual(fk.kelompok, ["keinginan", "kebutuhan"]);
assert.equal(adaFilter(fk), true);
assert.equal(alamatRiwayat(fk), "/riwayat?kelompok=keinginan,kebutuhan");
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
    jumlah: 4,
  },
);

// Merchant persis (B1, SPEC-perbaikan-temuan): spasi dirapikan, huruf tidak dibedakan, sama dengan Analitik.
const fm = bacaFilter({ merchant: "  Kopi   Kenangan " }, sah);
assert.equal(fm.merchant, "Kopi Kenangan");
assert.equal(adaFilter(fm), true);
assert.equal(alamatRiwayat(fm), "/riwayat?merchant=Kopi+Kenangan");
assert.deepEqual(bacaFilter(Object.fromEntries(new URL(alamatRiwayat(fm), "http://x").searchParams), sah), fm);
assert.equal(bacaFilter({ merchant: "x".repeat(300) }, sah).merchant.length, 100);
assert.equal(bacaFilter({ merchant: "   " }, sah).merchant, "");
// Pola regex (Postgres ~*): karakter khusus di-escape, spasi apa pun di antara kata.
const pola = polaMerchant("Toko (A.B)+1");
assert.equal(pola, "^\\s*Toko\\s+\\(A\\.B\\)\\+1\\s*$");
const re = new RegExp(pola, "i");
assert.ok(re.test("toko   (a.b)+1 "));
assert.ok(!re.test("Toko (AxB)+1"));
assert.ok(!re.test("Toko (A.B)+12"));
assert.ok(cocokMerchant("KOPI kenangan ", "Kopi Kenangan"));
assert.ok(!cocokMerchant("Kopi Kenangan Mantan", "Kopi Kenangan"));
assert.ok(!cocokMerchant(null, "Kopi Kenangan"));

// Tanpa pembelian dari tujuan tabungan (B2): hanya "tanpa"; id tujuan dari kantong user.
const ft = bacaFilter({ tujuan: "tanpa" }, sah);
assert.equal(ft.tujuan, "tanpa");
assert.deepEqual(ft.idTujuan, [T1]);
assert.equal(adaFilter(ft), true);
assert.equal(alamatRiwayat(ft), "/riwayat?tujuan=tanpa");
assert.equal(bacaFilter({ tujuan: "ya" }, sah).tujuan, null);
assert.deepEqual(bacaFilter({ tujuan: "tanpa" }, { kantong: [], kategori: [] }).idTujuan, []);

// Jumlah transaksi (A2): bagian dari transaksi yang sama dihitung satu.
const A = "a0000000-0000-4000-8000-000000000001";
const baris = (id: string, pecahan_dari: string | null, amount = 1, type = "expense") => ({ id, pecahan_dari, amount, type, transaction_date: "2026-10-24" });
assert.equal(ringkasRiwayat([baris(A, null), baris("b1", A), baris("b2", A), baris("c", null, 1, "income")]).jumlah, 2);
// Hanya bagian yang cocok filter (aslinya tidak): tetap satu transaksi.
assert.equal(ringkasRiwayat([baris("b1", A), baris("b2", A)]).jumlah, 1);

// Halaman tidak memisahkan bagian dari aslinya: transaksi dipecah di akhir halaman penuh ditunda utuh.
const dipecah = { [A]: { total: 3, jumlah: 3 } };
assert.equal(potongHalaman([baris("p", null), baris("q", null), baris(A, null), baris("b1", A)], 4, dipecah).length, 2);
assert.equal(potongHalaman([baris("p", null), baris("q", null), baris("r", null), baris(A, null)], 4, dipecah).length, 3); // asli di ujung: bagiannya mungkin di halaman berikut
assert.equal(potongHalaman([baris("p", null), baris(A, null), baris("b1", A)], 4, dipecah).length, 3); // belum penuh = halaman terakhir
assert.equal(potongHalaman([baris(A, null), baris("b1", A)], 2, dipecah).length, 2); // satu transaksi sebesar halaman: tidak dipotong
assert.equal(potongHalaman([baris("p", null), baris("q", null)], 2, dipecah).length, 2); // tidak dipecah: halaman utuh

// Kartu (A1): bagian yang cocok saja; nominal kartu = jumlah bagian yang tampil.
const tx = (id: string, pecahan_dari: string | null, amount: number) =>
  ({ id, pecahan_dari, amount, category: "food", type: "expense", transaction_date: "2026-10-24" }) as unknown as Transaction;
const info = { [A]: { total: 15000, jumlah: 3 } };
// Semua bagian tampil (tanpa filter): satu kartu penuh.
let kartu = susunKartu([tx(A, null, 8000), tx("b1", A, 5000), tx("b2", A, 2000), tx("z", null, 100)], info);
assert.equal(kartu.length, 2);
assert.deepEqual([kartu[0].nominal, kartu[0].penuh, kartu[0].baris.length, kartu[0].t.id], [15000, true, 3, A]);
// Hanya baris asli yang cocok: nominal bagiannya saja (+ "Bagian dari Rp 15.000").
kartu = susunKartu([tx(A, null, 8000)], info);
assert.deepEqual([kartu[0].nominal, kartu[0].penuh, kartu[0].baris.length], [8000, false, 1]);
// Dua dari tiga bagian cocok: satu kartu, jumlah keduanya, diwakili aslinya.
kartu = susunKartu([tx("b1", A, 5000), tx(A, null, 8000)], info);
assert.equal(kartu.length, 1);
assert.deepEqual([kartu[0].nominal, kartu[0].penuh, kartu[0].baris.length, kartu[0].t.id], [13000, false, 2, A]);
// Tidak dipecah: apa adanya.
kartu = susunKartu([tx("z", null, 100)], info);
assert.deepEqual([kartu[0].nominal, kartu[0].penuh, kartu[0].baris.length], [100, false, 1]);

// Total kelompok Beranda (A5): dihitung dari awal kelompok kartu terlama, per kelompok waktu.
const kini = new Date("2026-10-24T05:00:00Z"); // Sabtu 24 Okt 2026, 12.00 WIB
assert.equal(awalKelompokWaktu("2026-10-24", kini), "2026-10-24");
assert.equal(awalKelompokWaktu("2026-10-23", kini), "2026-10-23");
assert.equal(awalKelompokWaktu("2026-10-20", kini), "2026-10-19"); // Minggu ini mulai Senin
assert.equal(awalKelompokWaktu("2026-10-05", kini), "2026-10-01");
assert.equal(awalKelompokWaktu("2025-06-05", kini), "2025-01-01");
assert.deepEqual(
  totalKelompokWaktu(
    [
      { amount: 1000, transaction_date: "2026-10-24" },
      { amount: "500", transaction_date: "2026-10-24" },
      { amount: 200, transaction_date: "2026-10-19" },
      { amount: 70, transaction_date: "2026-10-02" },
    ],
    kini,
  ),
  { "Hari ini": 1500, "Minggu ini": 200, Oktober: 70 },
);

// Kalender rentang: minggu mulai Senin, kosong di depan & belakang.
const okt = gridBulan("2026-10"); // 1 Okt 2026 = Kamis
assert.equal(okt.length % 7, 0);
assert.deepEqual(okt.slice(0, 4), [null, null, null, "2026-10-01"]);
assert.equal(okt.filter(Boolean).length, 31);
assert.equal(gridBulan("2026-02").filter(Boolean).length, 28);
assert.equal(gridBulan("2026-06")[0], "2026-06-01"); // 1 Juni 2026 = Senin
assert.equal(geserBulan("2026-01", -1), "2025-12");
assert.equal(geserBulan("2026-12", 1), "2027-01");
// Ketuk: awal → akhir (ditukar kalau lebih awal) → mulai baru.
let rg = ketukTanggal({ dari: null, sampai: null }, "2026-09-20");
assert.deepEqual(rg, { dari: "2026-09-20", sampai: null });
rg = ketukTanggal(rg, "2026-09-10");
assert.deepEqual(rg, { dari: "2026-09-10", sampai: "2026-09-20" });
assert.deepEqual(ketukTanggal(rg, "2026-09-05"), { dari: "2026-09-05", sampai: null });
assert.deepEqual(ketukTanggal({ dari: "2026-09-10", sampai: null }, "2026-09-10"), { dari: "2026-09-10", sampai: "2026-09-10" });

console.log("✓ riwayat: baca & bersihkan filter URL, rentang periode (batas bulan/tahun), alamat bolak-balik, total per bulan & per hari, merchant persis, tanpa tujuan, jumlah & halaman pecahan, kartu bagian, total kelompok Beranda, kalender rentang");
