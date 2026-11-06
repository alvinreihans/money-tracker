/**
 * Uji Tanya AI (src/lib/tanya.ts, SPEC-analitik-ai).
 *
 * Pemakaian: npm run uji:tanya
 */
import assert from "node:assert/strict";
import { FILTER_KOSONG } from "../src/lib/riwayat.ts";
import { bulanDariArgumen, filterDariArgumen, hitungEkspresi, ringkasSaldo, rupiahDiJawaban, rupiahTakTerverifikasi, tautanDari, tautanJawaban } from "../src/lib/tanya.ts";

const GOPAY = "0b6c1b1e-6f3a-4d2b-9c1e-3a7f0e2d4c5b";
const k = {
  hariIni: "2026-10-24",
  kantong: [{ id: GOPAY, name: "GoPay", aliases: [] }],
  kategori: [
    { type: "expense", slug: "food" },
    { type: "expense", slug: "other" },
    { type: "income", slug: "other" },
    { type: "income", slug: "salary" },
  ],
};

// Nominal di jawaban: format penuh, ringkas (jt/rb), dengan/tanpa spasi.
assert.deepEqual(rupiahDiJawaban("Total Rp 60.000, sebelumnya Rp1.250.000."), [
  { nilai: 60000, toleransi: 0.5 },
  { nilai: 1250000, toleransi: 0.5 },
]);
assert.deepEqual(rupiahDiJawaban("sekitar Rp 1,2 jt dan Rp 450 rb"), [
  { nilai: 1200000, toleransi: 50000 },
  { nilai: 450000, toleransi: 500 },
]);
assert.deepEqual(rupiahDiJawaban("naik 32% tanpa nominal"), []);

// Pemeriksa: nominal harus ada di hasil fungsi (rekursif); ringkas boleh dibulatkan.
const hasil = [{ keluar: 1234567, kategori: [{ nama: "Makan", total: 60000 }] }];
assert.deepEqual(rupiahTakTerverifikasi("Keluar Rp 1,2 jt, makan Rp 60.000.", hasil), []);
assert.deepEqual(rupiahTakTerverifikasi("Keluar Rp 1.234.567.", hasil), []);
assert.deepEqual(rupiahTakTerverifikasi("Makan + belanja jadi Rp 1.294.567.", hasil), [1294567]); // AI menjumlah sendiri
assert.deepEqual(rupiahTakTerverifikasi("Sekitar Rp 2 jt.", hasil), [2000000]);

// Argumen cari_transaksi → filter yang sudah dibersihkan.
const f = filterDariArgumen({ dari: "2026-10-01", sampai: "2026-10-31", jenis: "keluar", kategori: ["food", "judi", "other"], kantong: ["gopay", "BCA"], kata: "kopi)" }, k);
assert.deepEqual(f, { ...FILTER_KOSONG, jenis: "keluar", q: "kopi", dari: "2026-10-01", sampai: "2026-10-31", kantong: [GOPAY], kategori: ["expense:food", "expense:other"] });
assert.deepEqual(filterDariArgumen({ jenis: "masuk", kategori: ["other"] }, k).kategori, ["income:other"]);
assert.equal(filterDariArgumen({ dari: "2026-02-30", jenis: "aneh" }, k).dari, null);
assert.equal(filterDariArgumen({ jenis: "aneh" }, k).jenis, "semua");
// Satu merchant: nama persis (SPEC-perbaikan-temuan F2), tautannya merchant=, bukan q=.
assert.equal(filterDariArgumen({ merchant: "  Kopi   Kenangan " }, k).merchant, "Kopi Kenangan");
assert.ok(tautanDari("cari_transaksi", { dari: "2026-10-01", sampai: "2026-10-31", merchant: "Kopi Kenangan" }, k)?.href.includes("merchant=Kopi+Kenangan"));
assert.doesNotMatch(tautanDari("cari_transaksi", { dari: "2026-10-01", sampai: "2026-10-31", merchant: "Kopi Kenangan" }, k)?.href ?? "", /[?&]q=/);

// Bulan: yang tidak sah atau di masa depan jatuh ke bulan berjalan.
assert.equal(bulanDariArgumen({ bulan: "2026-09" }, k.hariIni), "2026-09");
assert.equal(bulanDariArgumen({ bulan: "2027-01" }, k.hariIni), "2026-10");
assert.equal(bulanDariArgumen({ bulan: "Oktober" }, k.hariIni), "2026-10");

// Tautan telusur.
assert.deepEqual(tautanDari("cari_transaksi", { dari: "2026-10-01", sampai: "2026-10-31", jenis: "keluar", kategori: ["food"] }, k), {
  label: "Lihat di Riwayat",
  href: "/riwayat?jenis=keluar&dari=2026-10-01&sampai=2026-10-31&kategori=expense:food",
});
assert.deepEqual(tautanDari("ringkasan_bulan", { bulan: "2026-09" }, k), { label: "Buka Analitik September", href: "/analitik?bulan=2026-09" });
assert.deepEqual(tautanDari("ringkasan_bulan", { bulan: "2026-10" }, k), { label: "Buka Analitik Oktober", href: "/analitik" });

// Kalkulator: aritmetika biasa, urutan operasi & kurung, tanpa eval.
const data = [13356219, 10300000, 367000, 8000000];
assert.deepEqual(hitungEkspresi("13356219 - 10300000", data), { hasil: 3056219 });
assert.deepEqual(hitungEkspresi("8000000 - 367000", data), { hasil: 7633000 });
assert.deepEqual(hitungEkspresi("(367000 / 8000000) * 100", data), { hasil: 4.59 });
assert.deepEqual(hitungEkspresi("2 + 3 * 4", []), { hasil: 14 });
assert.deepEqual(hitungEkspresi("-(10 - 4) / 3", []), { hasil: -2 });
assert.ok("error" in hitungEkspresi("10 / 0", []));
// Angka besar harus dari hasil fungsi; selain aritmetika ditolak.
assert.ok("error" in hitungEkspresi("13356219 - 999999", data));
assert.ok("error" in hitungEkspresi("process.exit()", data));
assert.ok("error" in hitungEkspresi("1e9", data));
assert.ok("error" in hitungEkspresi("(1 + 2", []));
// Tautan: kalkulator tanpa tautan; pencarian berpengecualian memberi tahu tautannya sebelum dikecualikan.
assert.equal(tautanDari("hitung", { ekspresi: "1+1" }, k), null);
assert.equal(tautanDari("cari_transaksi", { kecuali: ["Laku6"] }, k)?.label, "Lihat semua di Riwayat");

// Jawaban dari ringkasan yang dihitung di depan: ikut "Buka Analitik [bulan]"; jawaban lain tidak.
const ringkasan = { bulan: "2026-09", keluar: 367000, kategori: [{ nama: "Makan", total: 107000 }] };
const analitikSep = { label: "Buka Analitik September", href: "/analitik?bulan=2026-09" };
assert.deepEqual(tautanJawaban([], { jawaban: "Pengeluaran September Rp 367.000.", ringkasan, bulan: "2026-09" }, k), [analitikSep]);
const lihat = { label: "Lihat kantong", href: "/profil/kantong" };
assert.deepEqual(tautanJawaban([lihat], { jawaban: "Saldo BCA Rp 24.900.000.", ringkasan, bulan: "2026-09" }, k), [lihat]);
assert.deepEqual(tautanJawaban([], { jawaban: "Maaf, aku hanya bisa membantu soal catatan keuanganmu.", ringkasan, bulan: "2026-09" }, k), []);
assert.deepEqual(tautanJawaban([analitikSep], { jawaban: "Keluar Rp 367.000.", ringkasan, bulan: "2026-09" }, k), [analitikSep], "tidak dobel");

// saldo_kantong: isi tiap tujuan terpisah dari jumlah semua tujuan.
const saldo = ringkasSaldo(
  [
    { id: "a", name: "BCA", kind: "bank" },
    { id: "b", name: "Dana Darurat", kind: "tujuan", target: "10000000", tenggat: null },
    { id: "c", name: "Liburan", kind: "tujuan", target: 5000000, tenggat: "2027-06-30" },
    { id: "d", name: "Budi", kind: "orang" },
  ],
  new Map([["a", 1000000], ["b", 2500000], ["c", 979999], ["d", 200000]]),
);
assert.deepEqual(saldo.kantong.map((x) => x.nama), ["BCA", "Budi"]);
assert.deepEqual(saldo.tujuan_tabungan[0], { nama_tujuan: "Dana Darurat", terkumpul: 2500000, target: 10000000, tenggat: null });
assert.equal(saldo.total_semua_tujuan, 3479999);
assert.equal(saldo.total_aset, 4479999, "orang tidak masuk aset; tujuan masuk");
assert.ok(!("total_semua_tujuan" in ringkasSaldo([{ id: "a", name: "BCA", kind: "bank" }], new Map())));

console.log("✓ tanya: nominal di jawaban (penuh & ringkas), pemeriksa angka, argumen AI dibersihkan, bulan, tautan telusur, kalkulator aman, tautan Analitik dari ringkasan di depan, saldo per tujuan tabungan");
