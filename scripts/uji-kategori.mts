/**
 * Uji kategori milik user (src/lib/kategori.ts) dan pemakaiannya di validasi
 * & normalisasi hasil AI.
 *
 * Pemakaian: npm run uji:kategori
 */
import assert from "node:assert/strict";
import { normalize } from "../src/lib/extract.ts";
import {
  cariKategori,
  KATEGORI_BAWAAN,
  kategoriJenis,
  namaKategori,
  slugBaru,
  validasiKategori,
  type Kategori,
} from "../src/lib/kategori.ts";
import { rapikanBudget, validasiTransaksi } from "../src/lib/transaksi-input.ts";

// User menghapus "Makan", menambah "Kopi" dan "Kucing".
const milikku: Kategori[] = [
  ...KATEGORI_BAWAAN.filter((k) => k.slug !== "food"),
  { type: "expense", slug: "c-kopi12345", name: "Kopi", icon: "coffee", color: "#ff9f43", sort: 9 },
  { type: "expense", slug: "c-kucing123", name: "Kucing", icon: "paw-print", color: "#bf7af0", sort: 10 },
];

// --- Daftar per jenis: urut sort, Lainnya paling akhir, pindah kantong kosong ---
const keluar = kategoriJenis(milikku, "expense");
assert.equal(keluar[0].slug, "groceries");
assert.equal(keluar.at(-1)?.slug, "other");
assert.ok(keluar.some((k) => k.name === "Kopi"));
assert.ok(!keluar.some((k) => k.type === "income"));
assert.deepEqual(kategoriJenis(milikku, "transfer"), []);

// --- "other" ada di dua jenis: yang dicari jenisnya sama ---
assert.equal(cariKategori(milikku, "other", "income")?.type, "income");
assert.equal(namaKategori(milikku, "c-kopi12345", "expense"), "Kopi");
assert.equal(namaKategori(milikku, "food", "expense"), "Lainnya"); // kategori yang sudah dihapus

// --- Slug buatan user: acak, berawalan c- ---
assert.equal(slugBaru(() => "0b6c1b1e-6f3a-4d2b-9c1e-3a7f0e2d4c5b"), "c-0b6c1b1e6f");
assert.match(slugBaru(), /^c-[0-9a-f]{10}$/);

// --- Validasi isian kategori ---
assert.deepEqual(validasiKategori({ name: "  Kos   bulanan ", icon: "home", color: "#3e91ff" }), {
  ok: true,
  data: { name: "Kos bulanan", icon: "home", color: "#3e91ff" },
});
assert.equal(validasiKategori({ name: "kopi", icon: "coffee", color: "#ff9f43" }, keluar).ok, false); // nama kembar
assert.equal(validasiKategori({ name: "", icon: "coffee", color: "#ff9f43" }).ok, false);
assert.equal(validasiKategori({ name: "x".repeat(31), icon: "coffee", color: "#ff9f43" }).ok, false);
assert.equal(validasiKategori({ name: "Kopi", icon: "roket", color: "#ff9f43" }).ok, false);
assert.equal(validasiKategori({ name: "Kopi", icon: "coffee", color: "#123456" }).ok, false);

// --- Transaksi memakai kategori milik user ---
const tx = { amount: "25000", type: "expense", transaction_date: "2026-10-21" };
assert.equal(validasiTransaksi({ ...tx, category: "c-kopi12345" }, { kategori: milikku }).ok, true);
assert.equal(validasiTransaksi({ ...tx, category: "food" }, { kategori: milikku }).ok, false); // sudah dihapus
assert.equal(validasiTransaksi({ ...tx, category: "salary" }, { kategori: milikku }).ok, false); // salah jenis

// --- Hasil AI di luar daftar jatuh ke "Lainnya" ---
assert.equal(normalize({ amount: 25000, type: "expense", category: "c-kopi12345" }, milikku).category, "c-kopi12345");
assert.equal(normalize({ amount: 25000, type: "expense", category: "food" }, milikku).category, "other");
assert.equal(normalize({ amount: 5e5, type: "income", category: "gift" }, milikku).category, "gift");
assert.equal(normalize({ amount: 5e5, type: "income", category: "c-kopi12345" }, milikku).category, "other");

// --- Budget hanya untuk kategori pengeluaran yang ada ---
assert.equal(rapikanBudget({ "c-kucing123": "300000" }, milikku).ok, true);
assert.equal(rapikanBudget({ food: "300000" }, milikku).ok, false);

console.log("✓ kategori: daftar per jenis, validasi, transaksi & AI memakai kategori milik user");
