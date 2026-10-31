/**
 * Uji kategori milik user (src/lib/kategori.ts) dan pemakaiannya di validasi
 * & normalisasi hasil AI.
 *
 * Pemakaian: npm run uji:kategori
 */
import assert from "node:assert/strict";
import { buildSystemPrompt, nominalDariPromo, normalize, tenorDariTeks, usulanPecah } from "../src/lib/extract.ts";
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
  data: { name: "Kos bulanan", icon: "home", color: "#3e91ff", kelompok: null, penghasilan: null },
});
// Penghasilan (SPEC-tujuan-tabungan): kategori pemasukan bawaannya ya, boleh dimatikan.
const katMasuk = (penghasilan?: boolean) => validasiKategori({ type: "income", name: "Kos-kosan", icon: "home", color: "#5ecb7a", penghasilan });
assert.equal((katMasuk() as { data: { penghasilan: boolean } }).data.penghasilan, true);
assert.equal((katMasuk(false) as { data: { penghasilan: boolean } }).data.penghasilan, false);
assert.equal((katKeluarAwal() as { data: { penghasilan: null } }).data.penghasilan, null);
// Kelompok budgeting (SPEC-metode-budget): pengeluaran wajib berkelompok (bawaan keinginan).
function katKeluarAwal() {
  return validasiKategori({ type: "expense", name: "Kos", icon: "home", color: "#3e91ff", penghasilan: true });
}
const katKeluar = (kelompok?: string) => validasiKategori({ type: "expense", name: "Kos", icon: "home", color: "#3e91ff", kelompok });
assert.equal((katKeluar("kebutuhan") as { data: { kelompok: string } }).data.kelompok, "kebutuhan");
assert.equal((katKeluar() as { data: { kelompok: string } }).data.kelompok, "keinginan");
assert.equal(katKeluar("mewah").ok, false);
// Kelompok baru (SPEC-kelompok-baru).
assert.equal((katKeluar("pengembangan") as { data: { kelompok: string } }).data.kelompok, "pengembangan");
assert.equal((katKeluar("tak_terduga") as { data: { kelompok: string } }).data.kelompok, "tak_terduga");
// Pendidikan bawaan: warnanya dari palet (bisa disunting di Profil → Kategori).
const pendidikan = KATEGORI_BAWAAN.find((k) => k.slug === "education")!;
assert.equal(validasiKategori({ type: "expense", name: "Pendidikan baru", icon: pendidikan.icon, color: pendidikan.color, kelompok: "pengembangan" }).ok, true);
// AI: kelompok baru diterima, kelompok asing jadi null.
assert.equal(normalize({ amount: 300000, type: "expense", category: "education", kelompok: "pengembangan" }).kelompok, "pengembangan");
assert.equal(normalize({ amount: 300000, type: "expense", category: "transport", kelompok: "liburan" }).kelompok, null);
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

// Nominal dari baris promo (bukti ShopeePay byU Rp 5.000 terbaca Rp 100.000).
const bukti = "= ShopeePay\nRp 5 . 0 0 0\nNama Merchant byU\nTa Fe: : Cashback Saldo s.d Rp100.000\nNol # Download on the GET ITON";
assert.equal(nominalDariPromo(bukti, 100000), true);
assert.equal(nominalDariPromo(bukti, 5000), false); // "Rp 5 . 0 0 0" dirapatkan = Rp5.000
assert.equal(nominalDariPromo(bukti.replace("Rp 5 . 0 0 0\n", ""), 100000), true);
assert.equal(nominalDariPromo("TOTAL 100.000\nCashback s.d Rp100.000", 100000), false); // ada juga di baris TOTAL
assert.equal(nominalDariPromo("TOTAL 37.000\nTUNAI 50.000", 13000), false); // tidak tertulis: tidak dinilai
assert.equal(nominalDariPromo("Diskon maks Rp10.000\nTotal Rp 110.000", 10000), true);
assert.equal(nominalDariPromo("Total Rp 110.000", 10000), false); // 10.000 bukan bagian dari 110.000

// Tenor paylater dari teks OCR yang terpecah ("SPayLater - 1 )" / "Pembayaran Bulan").
assert.equal(tenorDariTeks("Metode SPayLater - 1 )\nPembayaran Bulan"), 1);
assert.equal(tenorDariTeks("Metode Pembayaran GoPayLater - 3 Bulan"), 3);
assert.equal(tenorDariTeks("SPaylL ater Diskon 20RB -Rp20.000"), null);
assert.equal(tenorDariTeks("Saldo ShopeePay"), null);
// Nama penyedia paylater diseragamkan.
for (const [ditulis, harap] of [["SPayLater", "Shopee PayLater"], ["ShopeePay", "Shopee PayLater"], ["gopaylater", "GoPayLater"], ["Kredivo", "Kredivo"]]) {
  assert.equal(normalize({ amount: 1000, type: "expense", category: "food", paylater: { penyedia: ditulis, tenor: 1, per_cicilan: null, jatuh_tempo: null } }).paylater?.penyedia, harap, ditulis);
}

// --- Usulan pecah struk campuran (SPEC-tawar-pecah) ---
const u = (cat: string, subtotal: number, barang = "x") => ({ category: cat, kelompok: null, subtotal, barang });
const jumlah = (b: { amount: number }[] | null) => b?.reduce((n, x) => n + x.amount, 0);
// Diskon 12,5% dibagi proporsional.
assert.deepEqual(usulanPecah([u("groceries", 80000, "Beras, sabun"), u("food", 20000, "Cokelat")], 87500, KATEGORI_BAWAAN)?.map((b) => [b.category, b.amount, b.description]), [["groceries", 70000, "Beras, sabun"], ["food", 17500, "Cokelat"]]);
// PPN 11% ikut dibagi.
assert.deepEqual(usulanPecah([u("groceries", 60000), u("food", 40000)], 111000, KATEGORI_BAWAAN)?.map((b) => b.amount), [66600, 44400]);
// Sisa pembulatan ke bagian terbesar; jumlah selalu pas.
const bulat = usulanPecah([u("groceries", 30000), u("food", 30000), u("shopping", 40000)], 99999, KATEGORI_BAWAAN);
assert.deepEqual(bulat?.map((b) => b.amount), [29999, 29999, 40001]);
assert.equal(jumlah(bulat), 99999);
// Dibuang: sekategori, menyimpang > 25%, kurang dari 2, lebih dari 10, subtotal 0.
assert.equal(usulanPecah([u("food", 50000), u("food", 50000)], 100000, KATEGORI_BAWAAN), null);
assert.equal(usulanPecah([u("groceries", 70000), u("food", 60000)], 100000, KATEGORI_BAWAAN), null);
assert.notEqual(usulanPecah([u("groceries", 70000), u("food", 55000)], 100000, KATEGORI_BAWAAN), null); // 25% pas masih diterima
assert.equal(usulanPecah([u("groceries", 100000)], 100000, KATEGORI_BAWAAN), null);
assert.equal(usulanPecah(Array.from({ length: 11 }, (_, i) => u(i % 2 ? "food" : "groceries", 1000)), 11000, KATEGORI_BAWAAN), null);
assert.equal(usulanPecah([u("groceries", 100000), u("food", 0)], 100000, KATEGORI_BAWAAN), null);
// Kategori asing jatuh ke Lainnya.
assert.deepEqual(usulanPecah([u("groceries", 50000), u("rokok", 50000)], 100000, KATEGORI_BAWAAN)?.map((b) => b.category), ["groceries", "other"]);
// Hanya dari struk: teks ketikan (tanpa dariStruk) membuang usulan.
const struk = { amount: 87500, type: "expense" as const, category: "groceries", usulan_pecah: [u("groceries", 80000), u("food", 20000)] as never };
assert.equal(normalize(struk).usulan_pecah, null);
assert.equal(jumlah(normalize(struk, KATEGORI_BAWAAN, true).usulan_pecah), 87500);
assert.equal(normalize({ ...struk, pinjaman: { arah: "beri", pihak: "Budi" } }, KATEGORI_BAWAAN, true).usulan_pecah, null);

// --- Rincian ketikan (rincianAtauNull lewat normalize) ---
const r = (amount: number, category: string) => ({ amount, category, kelompok: null, description: null });
assert.deepEqual(normalize({ amount: 15000, type: "expense", category: "groceries", rincian: [r(10000, "groceries"), r(5000, "food")] }).rincian?.map((b) => b.amount), [10000, 5000]);
assert.equal(normalize({ amount: 15000, type: "expense", category: "groceries", rincian: [r(10000, "groceries"), r(4000, "food")] }).rincian, null);
assert.equal(normalize({ amount: 15000, type: "expense", category: "groceries", rincian: [r(10000, "groceries"), r(5000, "rokok")] }).rincian?.[1].category, "other");

// --- Prompt AI (SPEC-ai-kantong): nama kantong user; aturan struk hanya untuk struk.
const kantongUser = { kategori: KATEGORI_BAWAAN, kantong: ["BCA", "Liburan", "Dana Darurat"] };
const ketik = buildSystemPrompt("2026-10-31", kantongUser, "ketik");
const strukP = buildSystemPrompt("2026-10-31", kantongUser, "struk");
assert.ok(ketik.includes("Kantong milik user: BCA, Liburan, Dana Darurat."), "nama kantong user ada di prompt");
assert.ok(!buildSystemPrompt("2026-10-31", { kategori: KATEGORI_BAWAAN }, "ketik").includes("Kantong milik user"), "user tanpa kantong: kalimatnya tidak ditulis");
assert.ok(ketik.includes('"rincian"') && !ketik.includes("usulan_pecah") && !ketik.includes("TUNAI / CASH") && !ketik.includes("bukti_transfer"), "teks ketikan tanpa aturan struk");
assert.ok(strukP.includes("usulan_pecah") && strukP.includes("TUNAI / CASH") && strukP.includes("bukti_transfer") && !strukP.includes('"rincian"'), "struk tanpa rincian ketikan");
assert.ok(ketik.length < strukP.length * 0.8, `prompt ketikan lebih ringkas (${ketik.length} vs ${strukP.length} karakter)`);

console.log("✓ kategori: daftar per jenis, validasi, transaksi & AI memakai kategori milik user; nominal dari baris promo ditolak; tenor paylater dari teks; usulan pecah struk & rincian ketikan; prompt AI per sumber & nama kantong");
