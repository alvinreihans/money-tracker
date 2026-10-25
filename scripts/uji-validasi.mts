/**
 * Uji validasi transaksi yang diisi tangan (src/lib/transaksi-input.ts).
 *
 * Pemakaian: npm run uji:validasi
 */
import assert from "node:assert/strict";
import { alamatDetail, alamatInternal, angkaMentah, angkaRibuan, isianNominal, tujuanKembali } from "../src/lib/format.ts";
import { barisIkutan, bersihkanCari, rapikanBudget, validasiKantong, validasiTransaksi } from "../src/lib/transaksi-input.ts";

const sah = {
  amount: "25000",
  type: "expense",
  category: "food",
  transaction_date: "2026-10-21",
  merchant: "  Kopi Kenangan ",
  payment_method: "",
  description: undefined,
};

const hasil = validasiTransaksi(sah);
assert.ok(hasil.ok, "input sah harus lolos");
assert.deepEqual(hasil.data, {
  amount: 25000,
  type: "expense",
  category: "food",
  transaction_date: "2026-10-21",
  waktu: null,
  merchant: "Kopi Kenangan",
  payment_method: null,
  kantong_id: null,
  kantong_tujuan_id: null,
  description: null,
  biaya_admin: null,
  cashback: null,
});

// Jam opsional (SPEC-saldo-waktu): "HH:MM" atau kosong.
const jam = (waktu: unknown) => validasiTransaksi({ ...sah, waktu });
assert.equal(jam("10:30").ok && jam("10:30").data.waktu, "10:30");
assert.equal(jam("09:05:00").ok && jam("09:05:00").data.waktu, "09:05");
assert.equal(jam("").ok && jam("").data.waktu, null);
assert.equal(jam("24:00").ok, false);
assert.equal(jam("jam 10").ok, false);

// Kantong: id harus uuid; tujuan hanya untuk pindah kantong dan tidak boleh sama dengan asal.
const ID_A = "0b6c1b1e-6f3a-4d2b-9c1e-3a7f0e2d4c5b";
const ID_B = "9f8e7d6c-5b4a-4321-8fed-cba987654321";
const pindah = validasiTransaksi({ ...sah, type: "transfer", kantong_id: ID_A, kantong_tujuan_id: ID_B });
assert.ok(pindah.ok && pindah.data.kantong_tujuan_id === ID_B);
const keluar = validasiTransaksi({ ...sah, kantong_id: ID_A, kantong_tujuan_id: ID_B });
assert.ok(keluar.ok && keluar.data.kantong_id === ID_A && keluar.data.kantong_tujuan_id === null);

// Kategori per jenis; pindah kantong selalu "other". Biaya admin hanya untuk
// pindah kantong, cashback hanya untuk pengeluaran.
const gaji = validasiTransaksi({ ...sah, type: "income", category: "salary" });
assert.ok(gaji.ok && gaji.data.category === "salary");
const pindahBiaya = validasiTransaksi({ ...sah, type: "transfer", category: "food", biaya_admin: "1000", cashback: "500" });
assert.ok(pindahBiaya.ok && pindahBiaya.data.category === "other" && pindahBiaya.data.biaya_admin === 1000 && pindahBiaya.data.cashback === null);
const belanjaCb = validasiTransaksi({ ...sah, cashback: "5000", biaya_admin: "1000" });
assert.ok(belanjaCb.ok && belanjaCb.data.cashback === 5000 && belanjaCb.data.biaya_admin === null);
const nol = validasiTransaksi({ ...sah, cashback: "0" });
assert.ok(nol.ok && nol.data.cashback === null);

// Pembayaran cicilan: hanya pengeluaran, harus bernomor; tanpa cicilan tidak ada kolomnya.
const bayarCicilan = validasiTransaksi({ ...sah, cicilan_id: ID_A, cicilan_ke: "3" });
assert.ok(bayarCicilan.ok && bayarCicilan.data.cicilan_id === ID_A && bayarCicilan.data.cicilan_ke === 3);
assert.ok(!("cicilan_id" in (validasiTransaksi(sah) as { data: object }).data));
assert.equal(validasiTransaksi({ ...sah, cicilan_id: ID_A }).ok, false); // tanpa nomor

// Galat menyebut isian yang salah, supaya pesannya tampil di bawah isian itu.
const kolom = (input: Record<string, unknown>, opsi?: Parameters<typeof validasiTransaksi>[1]) => {
  const h = validasiTransaksi(input, opsi);
  return h.ok ? "lolos" : h.kolom;
};
assert.equal(kolom({ ...sah, amount: "" }), "amount");
assert.equal(kolom({ ...sah, transaction_date: "2026-13-40" }), "transaction_date");
assert.equal(kolom({ ...sah, waktu: "25:00" }), "waktu");
assert.equal(kolom({ ...sah, merchant: "x".repeat(121) }), "merchant");
assert.equal(kolom({ ...sah, description: "x".repeat(501) }), "description");
assert.equal(kolom({ ...sah, kantong_id: "" }, { wajibKantong: true }), "kantong_id");
assert.equal(kolom({ ...sah, cashback: "999999999" }), "cashback");
assert.equal(validasiTransaksi({ ...sah, type: "pinjam" }).ok === false && (validasiTransaksi({ ...sah, type: "pinjam" }) as { kolom?: string }).kolom, undefined);
const kantongSalah = validasiKantong({ name: "", emoji: "💳", saldo_awal: "0", saldo_per: "2026-10-01" });
assert.equal(!kantongSalah.ok && kantongSalah.kolom, "name");
assert.equal(validasiTransaksi({ ...sah, type: "income", category: "salary", cicilan_id: ID_A, cicilan_ke: 1 }).ok, false);
assert.equal(validasiTransaksi({ ...sah, cicilan_id: ID_A, cicilan_ke: 0 }).ok, false);

// Transaksi ikutan.
const induk = { id: "p", user_id: "u", transaction_date: "2026-10-21", kantong_id: ID_A, payment_method: "BCA", merchant: "Kopi", status: "confirmed", source: "text" };
assert.deepEqual(barisIkutan({ ...induk, type: "transfer" }, { biaya_admin: 1000 }, "GoPay"), {
  user_id: "u", transaction_date: "2026-10-21", kantong_id: ID_A, kantong_tujuan_id: null, payment_method: "BCA",
  status: "confirmed", source: "text", raw_ocr_text: null, induk_id: "p",
  type: "expense", category: "fees", amount: 1000, merchant: "Biaya admin", description: "Pindah ke GoPay",
});
const cb = barisIkutan({ ...induk, type: "expense" }, { cashback: 5000 });
assert.ok(cb && cb.type === "income" && cb.category === "refund" && cb.amount === 5000 && cb.kantong_id === ID_A);
assert.equal(barisIkutan({ ...induk, type: "expense" }, { biaya_admin: 1000 }), null); // biaya admin bukan untuk belanja
assert.equal(barisIkutan({ ...induk, type: "income" }, { cashback: 5000 }), null);

// Sudah punya kantong: kantong wajib; pindah kantong wajib dua-duanya.
const wajib = { wajibKantong: true };
assert.equal(validasiTransaksi(sah, wajib).ok, false);
assert.equal(validasiTransaksi({ ...sah, kantong_id: ID_A }, wajib).ok, true);
assert.equal(validasiTransaksi({ ...sah, type: "transfer", kantong_id: ID_A }, wajib).ok, false);
assert.equal(validasiTransaksi({ ...sah, type: "transfer", kantong_id: ID_A, kantong_tujuan_id: ID_B }, wajib).ok, true);

const tolak: Array<[string, Record<string, unknown>]> = [
  ["nominal kosong", { ...sah, amount: "" }],
  ["nominal nol", { ...sah, amount: 0 }],
  ["nominal negatif", { ...sah, amount: -5 }],
  ["nominal bukan angka", { ...sah, amount: "dua puluh" }],
  ["nominal kebesaran", { ...sah, amount: 1e12 }],
  ["jenis asing", { ...sah, type: "refund" }],
  ["kategori asing", { ...sah, category: "judi" }],
  ["tanggal format salah", { ...sah, transaction_date: "21/10/2026" }],
  ["tanggal tidak ada", { ...sah, transaction_date: "2026-02-30" }],
  ["merchant bukan teks", { ...sah, merchant: 123 }],
  ["keterangan kepanjangan", { ...sah, description: "x".repeat(501) }],
  ["kantong bukan uuid", { ...sah, kantong_id: "bca" }],
  ["kategori pemasukan untuk pengeluaran", { ...sah, category: "salary" }],
  ["kategori pengeluaran untuk pemasukan", { ...sah, type: "income", category: "food" }],
  ["cashback lebih besar dari belanja", { ...sah, cashback: "30000" }],
  ["biaya admin bukan angka", { ...sah, type: "transfer", biaya_admin: "seribu" }],
  ["kantong asal = tujuan", { ...sah, type: "transfer", kantong_id: ID_A, kantong_tujuan_id: ID_A }],
];

for (const [nama, input] of tolak) {
  assert.equal(validasiTransaksi(input).ok, false, `harus ditolak: ${nama}`);
}

// Teks cari: karakter sintaks PostgREST dibuang, teks biasa utuh.
assert.equal(bersihkanCari("  kopi  kenangan "), "kopi kenangan");
assert.equal(bersihkanCari("x),merchant.eq.y"), "x merchant.eq.y");
assert.equal(bersihkanCari("50%*"), "50");
assert.equal(bersihkanCari('a\\b"c:d'), "a b c d");
assert.equal(bersihkanCari(undefined), "");
assert.equal(bersihkanCari("x".repeat(80)).length, 50);

// Budget: kosong = hapus target, isi = simpan (dibulatkan ke rupiah).
assert.deepEqual(rapikanBudget({ food: "1500000", transport: " ", bills: "250000.4" }), {
  ok: true,
  simpan: [
    { category: "food", amount: 1500000 },
    { category: "bills", amount: 250000 },
  ],
  hapus: ["transport"],
});
assert.equal(rapikanBudget({ food: "0" }).ok, false);
assert.equal(rapikanBudget({ food: "-5" }).ok, false);
assert.equal(rapikanBudget({ food: "1e12" }).ok, false);
assert.equal(rapikanBudget({ judi: "5000" }).ok, false);

// Kantong: saldo awal kosong = 0, boleh minus; nama & tanggal wajib.
const kantong = { name: "  GoPay ", emoji: "📱", saldo_awal: "", saldo_per: "2026-10-01" };
assert.deepEqual(validasiKantong(kantong), {
  ok: true,
  data: { name: "GoPay", emoji: "📱", saldo_awal: 0, saldo_per: "2026-10-01" },
});
const minus = validasiKantong({ ...kantong, saldo_awal: "-250000" });
assert.ok(minus.ok && minus.data.saldo_awal === -250000);
for (const salah of [
  { ...kantong, name: "  " },
  { ...kantong, name: "x".repeat(41) },
  { ...kantong, emoji: "" },
  { ...kantong, emoji: "BCA" },
  { ...kantong, saldo_awal: "sejuta" },
  { ...kantong, saldo_awal: 1e12 },
  { ...kantong, saldo_per: "2026-02-30" },
]) {
  assert.equal(validasiKantong(salah).ok, false, JSON.stringify(salah));
}

// Halaman asal dari URL: hanya alamat di dalam aplikasi (cegah open redirect).
assert.equal(tujuanKembali("/"), "/");
assert.equal(tujuanKembali("/riwayat?filter=keluar&q=kopi"), "/riwayat?filter=keluar&q=kopi");
for (const jahat of ["//situs-lain.com", "https://situs-lain.com", "/\\situs-lain.com", "javascript:alert(1)", "riwayat", "/transactions/abc", undefined, ""]) {
  assert.equal(tujuanKembali(jahat), "/riwayat", String(jahat));
}
assert.equal(alamatDetail("abc", "/riwayat?filter=keluar&q=kopi"), "/transactions/abc?kembali=%2Friwayat%3Ffilter%3Dkeluar%26q%3Dkopi");
assert.equal(alamatDetail("abc"), "/transactions/abc");
// Tujuan setelah masuk / dari tautan email.
assert.equal(alamatInternal("/riwayat?filter=draft", "/"), "/riwayat?filter=draft");
for (const jahat of ["@situs-lain.com", "//situs-lain.com", "/\\situs-lain.com", "https://situs-lain.com", null, undefined, ""]) {
  assert.equal(alamatInternal(jahat, "/"), "/", String(jahat));
}

// Isian nominal: tampil dengan titik ribuan, disimpan mentah.
assert.equal(angkaRibuan("1500000"), "1.500.000");
assert.equal(angkaRibuan("999"), "999");
assert.equal(angkaRibuan(""), "");
assert.equal(angkaRibuan("-250000"), "-250.000");
assert.equal(angkaMentah("1.500.000"), "1500000");
assert.equal(angkaMentah("Rp 25.000,-"), "25000");
assert.equal(angkaMentah("007"), "7");
assert.equal(angkaMentah("-250.000"), "250000"); // minus hanya kalau boleh
assert.equal(angkaMentah("-250.000", true), "-250000");
assert.equal(angkaMentah("-", true), "-");
assert.equal(isianNominal("28000.00"), "28000");
assert.equal(isianNominal(null), "");

console.log(`✓ validasi transaksi: 1 sah + ${tolak.length} tolak; teks cari aman; budget; kantong; alamat kembali aman; format nominal`);
