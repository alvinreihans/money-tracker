/**
 * Uji Lengkapi (SPEC-lengkapi): pencocokan screenshot/struk ke transaksi yang
 * sudah tercatat, isian yang diubah/tidak diubah, cashback ke kantong
 * ShopeePay, pengenal bukti ganda, dan penempatan deposito manual
 * (SPEC-impor-rekening). Semua data rekaan, bukan data user.
 *
 * Pemakaian: npm run uji:lengkapi
 */
import assert from "node:assert/strict";
import { normalize, rekeningTujuan } from "../src/lib/extract.ts";
import {
  bacaRef,
  buktiCocok,
  cariPasangan,
  isianLengkapi,
  isiDariEkstraksi,
  kantongCashback,
  rapikanRef,
  refDariNamaBerkas,
  refDipakai,
  sudahJenis,
  tambahRef,
  type BuktiCocok,
  type CalonLengkapi,
  type TxDilengkapi,
} from "../src/lib/lengkapi.ts";
import { bacaRekening } from "../src/lib/rekening/baca.ts";
import { rencanakan, type KantongRencana, type TransaksiLama } from "../src/lib/rekening/rencana.ts";
import { susunBaris } from "../src/lib/rekening/teks.ts";
import { seabankBulan } from "./contoh-rekening.mjs";
import { KATEGORI_BAWAAN } from "../src/lib/kategori.ts";
import type { ExtractedReceipt } from "../src/types/transaction.ts";

const KANTONG = [
  { id: "sea", name: "SeaBank", kind: "bank" as const, aliases: null, macam_simpanan: null },
  { id: "bca", name: "BCA", kind: "bank" as const, aliases: null, macam_simpanan: null },
  { id: "spay", name: "ShopeePay", kind: "ewallet" as const, aliases: null, macam_simpanan: null },
  { id: "dep", name: "Deposito Contoh", kind: "simpanan" as const, aliases: null, macam_simpanan: "deposito" },
];

/** Hasil baca AI rekaan, dirapikan lewat normalize seperti jalur aslinya. */
const baca = (x: Partial<ExtractedReceipt>) =>
  normalize({ type: "expense", category: "other", transaction_date: "2026-09-03", document_type: "payment_proof", ...x }, KATEGORI_BAWAAN, true);

const tx = (id: string, x: Partial<CalonLengkapi> = {}): CalonLengkapi => ({
  id,
  amount: 32_500,
  type: "expense",
  transaction_date: "2026-09-03",
  waktu: null,
  kantong_id: "sea",
  ref_bukti: null,
  source: "statement",
  urut: null,
  ...x,
});
const ids = (h: { kandidat: CalonLengkapi[] }) => h.kandidat.map((k) => k.id);

// ------------------------------------------------------------ hasil baca AI

{
  // Screenshot: amount = "Kamu Membayar"; voucher diabaikan di screenshot.
  const ss = baca({ amount: 15_680, voucher: 20_000, sumber_dana: "SeaBank", dompet: "ShopeePay", ref_bukti: "abc-123 xyz", cashback: 15 });
  assert.equal(ss.amount, 15_680);
  assert.equal(ss.voucher, null);
  assert.equal(ss.ref_bukti, "ABC123XYZ");
  assert.equal(ss.cashback, 15);
  // Struk dengan voucher: tercatat = yang ditagih ke QRIS (= baris rekening koran).
  const struk = baca({ document_type: "receipt", amount: 17_500, voucher: 5_500, payment_method: "ShopeePay", dompet: "ShopeePay", ref_bukti: "Bon ZZ01-234-5678ABCD" });
  assert.equal(struk.amount, 12_000);
  assert.equal(struk.voucher, 5_500);
  assert.equal(struk.ref_bukti, "BONZZ012345678ABCD");
  // Voucher ≥ total = salah baca: diabaikan.
  assert.equal(baca({ document_type: "receipt", amount: 10_000, voucher: 10_000 }).amount, 10_000);
  // Rekening tujuan: bank + 4 digit terakhir, apa pun yang ditulis model.
  assert.equal(rekeningTujuan("BCA …67890"), "BCA …7890");
  assert.equal(rekeningTujuan("BCA 1234567890"), "BCA …7890");
  assert.equal(rekeningTujuan("Mandiri *4321"), "Mandiri …4321");
  assert.equal(baca({ amount: 75_000, rekening_tujuan: "BCA …67890" }).rekening_tujuan, "BCA …7890");
  // Ketikan (bukan struk) tidak membawa field bukti.
  assert.equal(normalize({ amount: 5000, type: "expense", category: "food", transaction_date: "2026-09-03", voucher: 1000 } as Partial<ExtractedReceipt>).amount, 5000);
}

// ------------------------------------------------------------ cariPasangan

const ssSea: BuktiCocok = { jenis: "ss", type: "expense", nominal: 32_500, tanggal: "2026-09-03", jam: "08:45", kantong: "sea" };
{
  // Nominal net vs total: hanya yang "Kamu Membayar".
  const h = cariPasangan({ ...ssSea, nominal: 15_680 }, [tx("a", { amount: 15_680 }), tx("b", { amount: 35_680 })]);
  assert.deepEqual([ids(h), h.pasti], [["a"], true]);
  // Tanggal beda: tidak (screenshot selalu sama).
  assert.deepEqual(ids(cariPasangan(ssSea, [tx("a", { transaction_date: "2026-09-04" })])), []);
  // Kantong sumber dana: SeaBank saja.
  assert.deepEqual(ids(cariPasangan(ssSea, [tx("a", { kantong_id: "bca" }), tx("b")])), ["b"]);
  // Uang masuk tidak dicocokkan ke pengeluaran.
  assert.deepEqual(ids(cariPasangan(ssSea, [tx("a", { type: "income" })])), []);
}
{
  // Struk: +1 hari hanya bila jam ≥ 22.00 (tanggal bisnis kasir).
  const struk: BuktiCocok = { jenis: "struk", type: "expense", nominal: 32_500, tanggal: "2026-09-03", jam: "22:15", kantong: null };
  assert.deepEqual(ids(cariPasangan(struk, [tx("a", { transaction_date: "2026-09-04" })])), ["a"]);
  assert.deepEqual(ids(cariPasangan({ ...struk, jam: "21:59" }, [tx("a", { transaction_date: "2026-09-04" })])), []);
  // Tanggal sama lebih dulu daripada +1 hari.
  assert.deepEqual(ids(cariPasangan(struk, [tx("a", { transaction_date: "2026-09-04" }), tx("b")]))[0], "b");
  // Kantong perantara (QRIS ShopeePay): kantong mana pun.
  assert.deepEqual(ids(cariPasangan({ ...struk, jam: "08:45" }, [tx("a", { kantong_id: "bca" })])), ["a"]);
}
{
  // buktiCocok: sumber dana, perantara, Saldo ShopeePay, deposito tidak pernah jadi sumber.
  const ss = buktiCocok(baca({ amount: 32_500, sumber_dana: "SeaBank", payment_method: "SeaBank", dompet: "ShopeePay", time: "08:45" }), KANTONG);
  assert.deepEqual([ss.jenis, ss.kantong, ss.tanpaKantong, ss.jam], ["ss", "sea", false, "08:45"]);
  const qris = buktiCocok(baca({ document_type: "receipt", amount: 12_000, payment_method: "ShopeePay", dompet: "ShopeePay" }), KANTONG);
  assert.deepEqual([qris.jenis, qris.kantong, qris.tanpaKantong], ["struk", null, false]);
  const saldo = buktiCocok(baca({ amount: 5_000, sumber_dana: "ShopeePay", payment_method: "ShopeePay", dompet: "ShopeePay" }), KANTONG);
  assert.deepEqual([saldo.kantong, saldo.tanpaKantong], ["spay", false]);
  const tanpa = buktiCocok(baca({ amount: 5_000, sumber_dana: "ShopeePay", dompet: "ShopeePay" }), KANTONG.filter((k) => k.id !== "spay"));
  assert.equal(tanpa.tanpaKantong, true);
  assert.deepEqual(ids(cariPasangan(tanpa, [tx("a", { amount: 5_000 })])), []);
  assert.equal(buktiCocok(baca({ amount: 5_000, sumber_dana: "Deposito Contoh" }), KANTONG).tanpaKantong, true);
  // Paylater bukan potongan rekening.
  assert.equal(buktiCocok(baca({ amount: 5_000, paylater: { penyedia: "SPayLater", tenor: 1, per_cicilan: null, jatuh_tempo: null } }), KANTONG).tanpaKantong, true);
  // Isi saldo ShopeePay dari SeaBank (pindah kantong): sisi asal.
  const isi = buktiCocok(baca({ type: "transfer", amount: 50_000, payment_method: "SeaBank", payment_target: "ShopeePay" }), KANTONG);
  assert.deepEqual(ids(cariPasangan(isi, [tx("a", { amount: 50_000, type: "transfer", kantong_tujuan_id: "spay" })])), ["a"]);
  // Tarik saldo ShopeePay ke SeaBank: baris masuk di SeaBank.
  const tarik = buktiCocok(baca({ type: "transfer", amount: 50_000, payment_method: "ShopeePay", payment_target: "SeaBank" }), KANTONG);
  assert.deepEqual(ids(cariPasangan(tarik, [tx("a", { amount: 50_000, type: "income" })])), ["a"]);
}
{
  // Sumber sejenis tidak dua kali: sudah dilengkapi screenshot → bukan kandidat screenshot lain, tetap untuk struk.
  const sudah = tx("a", { ref_bukti: "ss:SN0000001 h:0123456789abcdef" });
  assert.deepEqual(ids(cariPasangan(ssSea, [sudah])), []);
  assert.deepEqual(ids(cariPasangan({ ...ssSea, jenis: "struk", kantong: null }, [sudah])), ["a"]);
}
{
  // Beberapa kandidat berjam: yang jamnya paling dekat (≤ 15 menit) pasti.
  const h = cariPasangan(ssSea, [tx("a", { waktu: "13:00:00", source: "text" }), tx("b", { waktu: "08:50:00", source: "text" })]);
  assert.deepEqual([ids(h), h.pasti], [["b", "a"], true]);
  // Dua-duanya dekat: ragu, urut menurut jarak.
  const r = cariPasangan(ssSea, [tx("a", { waktu: "08:55:00" }), tx("b", { waktu: "08:47:00" })]);
  assert.deepEqual([ids(r), r.pasti], [["b", "a"], false]);
}
{
  // Baris SeaBank tanpa jam: urutan rekening dibanding jam tetangga yang sudah dilengkapi.
  const calon = [tx("p", { urut: 2 }), tx("q", { urut: 5 })];
  const tetangga = [
    { id: "p", kantong_id: "sea", transaction_date: "2026-09-03", urut: 2, waktu: null },
    { id: "x", kantong_id: "sea", transaction_date: "2026-09-03", urut: 3, waktu: "12:00:00" },
    { id: "q", kantong_id: "sea", transaction_date: "2026-09-03", urut: 5, waktu: null },
  ];
  const pagi = cariPasangan({ ...ssSea, jam: "10:00" }, calon, { tetangga });
  assert.deepEqual([ids(pagi)[0], pagi.pasti], ["p", true]);
  const sore = cariPasangan({ ...ssSea, jam: "14:00" }, calon, { tetangga });
  assert.deepEqual([ids(sore)[0], sore.pasti], ["q", true]);
  // Tanpa tetangga berjam: ragu, urutan rekening koran dulu.
  const ragu = cariPasangan({ ...ssSea, jam: "10:00" }, calon, { tetangga: tetangga.filter((x) => x.id !== "x") });
  assert.deepEqual([ids(ragu), ragu.pasti], [["p", "q"], false]);
  // Dua gambar sebayar di unggahan yang sama: gambar ke-k menurut jam = baris ke-k rekening.
  const kedua = cariPasangan({ ...ssSea, jam: "10:00" }, calon, { peringkat: { ke: 2, dari: 2 } });
  assert.deepEqual([ids(kedua)[0], kedua.pasti], ["q", true]);
  const pertama = cariPasangan({ ...ssSea, jam: "07:00" }, calon, { peringkat: { ke: 1, dari: 2 } });
  assert.deepEqual([ids(pertama)[0], pertama.pasti], ["p", true]);
  // Jumlah gambar ≠ jumlah baris: tetap ragu.
  assert.equal(cariPasangan(ssSea, calon, { peringkat: { ke: 1, dari: 3 } }).pasti, false);
}

// ------------------------------------------------------------ isian

const dariBank: TxDilengkapi = {
  id: "t1",
  amount: 32_500,
  type: "expense",
  category: "other",
  merchant: "ShopeePay",
  description: "ShopeePay Payment",
  waktu: null,
  kelompok: null,
  source: "statement",
  ref_bukti: null,
  perlu_dilengkapi: true,
  usulan_pecah: null,
};
{
  const e = baca({ amount: 32_500, merchant: "Toko Contoh", time: "08:45", category: "groceries", ref_bukti: "SN-0001-ABCD", cashback: 15, dompet: "ShopeePay", sumber_dana: "SeaBank" });
  const { patch, sebelum, perubahan } = isianLengkapi(dariBank, isiDariEkstraksi(e, "0123456789abcdef"));
  assert.deepEqual(
    [patch.merchant, patch.waktu, patch.category, patch.perlu_dilengkapi, patch.ref_bukti],
    ["Toko Contoh", "08:45:00", "groceries", false, "ss:SN0001ABCD h:0123456789abcdef"],
  );
  // Nominal, tanggal, kantong tidak pernah ada di isian.
  for (const k of ["amount", "transaction_date", "kantong_id", "kantong_tujuan_id", "type"]) assert.equal(k in patch, false, k);
  assert.deepEqual(sebelum, { merchant: "ShopeePay", waktu: null, category: "other", kelompok: null, ref_bukti: null, perlu_dilengkapi: true });
  assert.ok(perubahan.includes("Merchant: ShopeePay → Toko Contoh"));
  assert.ok(perubahan.includes("Cashback Rp 15".replace(" ", " ")) || perubahan.some((p) => p.startsWith("Cashback")));
  // Jam bank tetap; jam tidak diisi bila tidak boleh (hari saldo kantong).
  assert.equal(isianLengkapi({ ...dariBank, waktu: "08:40:00" }, isiDariEkstraksi(e)).patch.waktu, undefined);
  assert.equal(isianLengkapi(dariBank, isiDariEkstraksi(e), { jamBoleh: false }).patch.waktu, undefined);
}
{
  // Diketik user: merchant & keterangannya tidak ditimpa screenshot; kategori user tidak ditimpa struk tanpa ditanya.
  const user: TxDilengkapi = { ...dariBank, source: "text", merchant: "Belanja pagi", description: "sabun", category: "shopping", perlu_dilengkapi: false };
  const struk = baca({ document_type: "receipt", amount: 32_500, merchant: "Toko Contoh Cabang 1", category: "groceries", description: "Beras, sabun", ref_bukti: "BON123456" });
  const r = isianLengkapi(user, isiDariEkstraksi(struk));
  assert.deepEqual([r.patch.merchant, r.patch.description, r.patch.category, r.patch.perlu_dilengkapi], [undefined, undefined, undefined, undefined]);
  assert.deepEqual(r.tawarKategori, { category: "groceries", kelompok: null });
  assert.equal(isianLengkapi(user, isiDariEkstraksi(struk), { gantiKategori: true }).patch.category, "groceries");
  // Screenshot dulu, lalu struk: struk mengisi bagiannya (nama gerai, barang), screenshot sesudah struk tidak menimpa.
  const sesudahSs = { ...dariBank, merchant: "Toko Contoh", description: null, ref_bukti: "ss:SN1 h:aaaaaaaaaaaaaaaa", perlu_dilengkapi: false, waktu: "08:45:00" };
  const r2 = isianLengkapi(sesudahSs, isiDariEkstraksi(struk));
  assert.deepEqual([r2.patch.merchant, r2.patch.description, r2.patch.waktu], ["Toko Contoh Cabang 1", "Beras, sabun", undefined]);
  assert.match(r2.patch.ref_bukti as string, /ss:SN1 h:a+ struk:BON123456/);
  const sesudahStruk = { ...dariBank, merchant: "Toko Contoh Cabang 1", ref_bukti: "struk:BON123456" };
  assert.equal(isianLengkapi(sesudahStruk, isiDariEkstraksi(baca({ amount: 32_500, merchant: "Toko Contoh" }))).patch.merchant, undefined);
  // §4 paksa: merchant dari gambar baru tetap dipakai.
  assert.equal(isianLengkapi(sesudahStruk, isiDariEkstraksi(baca({ amount: 32_500, merchant: "Toko Contoh" })), { paksa: true }).patch.merchant, "Toko Contoh");
  // Transfer bank: keterangan "Kirim ke … · BCA …7890".
  const tf = isianLengkapi({ ...dariBank, merchant: "Transfer" }, isiDariEkstraksi(baca({ amount: 32_500, merchant: "Budi Contoh", rekening_tujuan: "BCA …7890" })));
  assert.equal(tf.patch.description, "Kirim ke Budi Contoh · BCA …7890");
  // Usulan pecah dari struk hanya bila jumlahnya = nominal transaksinya.
  const pecah = baca({ document_type: "receipt", amount: 32_500, usulan_pecah: [{ category: "groceries", kelompok: null, subtotal: 20_000, barang: "Beras" } as never, { category: "food", kelompok: null, subtotal: 12_500, barang: "Cokelat" } as never] });
  assert.ok(isianLengkapi(dariBank, isiDariEkstraksi(pecah)).patch.usulan_pecah);
  assert.equal(isianLengkapi({ ...dariBank, dipecah: true }, isiDariEkstraksi(pecah)).patch.usulan_pecah, undefined);
}

// ------------------------------------------------------------ cashback & pengenal bukti

assert.equal(kantongCashback("ShopeePay", KANTONG)?.id, "spay");
assert.equal(kantongCashback("shopee pay", KANTONG.filter((k) => k.id !== "spay")), null);
{
  assert.equal(rapikanRef("ab-12"), null);
  assert.equal(tambahRef(null, "ss", null, "0123456789abcdef"), "ss:- h:0123456789abcdef");
  assert.equal(tambahRef("ss:- h:0123456789abcdef", "ss", "SN-77777"), "ss:- h:0123456789abcdef ss:SN77777");
  assert.equal(tambahRef("ss:SN77777", "ss", null), "ss:SN77777");
  assert.ok(sudahJenis("ss:-", "ss") && !sudahJenis("ss:-", "struk"));
  assert.deepEqual(bacaRef("struk:BON1 h:ff"), [{ jenis: "struk", nilai: "BON1" }, { jenis: "h", nilai: "ff" }]);
  const daftar = [{ id: "a", ref_bukti: "ss:SN77777 h:0123456789abcdef" }, { id: "b", ref_bukti: "struk:ZZ012345678ABCD h:fedcba9876543210" }];
  assert.equal(refDipakai(daftar, { sidik: "0123456789abcdef" })?.id, "a");
  assert.equal(refDipakai(daftar, { jenis: "ss", nilai: "sn-77777" })?.id, "a");
  assert.equal(refDipakai(daftar, { jenis: "struk", nilai: "SN77777" }), null);
  assert.equal(refDipakai(daftar, { sidik: "1111111111111111" }), null);
  // Struk digital "receipt-<toko>-<bon>.png": dikenali dari nama berkas sebelum AI.
  assert.equal(refDariNamaBerkas("receipt-ZZ01-2345678ABCD.png", daftar)?.id, "b");
  assert.equal(refDariNamaBerkas("receipt-ZZ01-2345678ABCD (1).png", daftar)?.id, "b");
  assert.equal(refDariNamaBerkas("Screenshot_20260903_084512_ShopeePay.jpg", daftar), null);
}

// ------------------------------------------------------------ deposito manual "Sudah termasuk"

{
  // Deposito dibuat manual 7 Nov ("Sudah termasuk": pindah SeaBank → deposito di hari itu),
  // lalu rekening koran Juli (bulan penempatan) diimpor: penempatannya ditautkan ke
  // pindah kantong itu, bukan pindah kantong kedua.
  const kantong: KantongRencana[] = [
    { id: "sea", name: "SeaBank", kind: "bank", nomor_akhir: "1234", saldo_awal: 2_500_000, saldo_per: "2026-06-30", saldo_sejak: "2026-06-30T00:00:00+07:00" },
    { id: "dep", name: "Deposito Uji", kind: "simpanan", induk_id: "sea", macam_simpanan: "deposito", saldo_awal: 0, saldo_per: "2026-11-07", saldo_sejak: "2026-11-07T10:00:00+07:00" },
  ];
  const buatan: TransaksiLama = { id: "buat", amount: 2_000_000, type: "transfer", kantong_id: "sea", kantong_tujuan_id: "dep", transaction_date: "2026-11-07", waktu: "10:00:00" };
  const juli = bacaRekening(
    susunBaris(seabankBulan({ dari: "01 JUL 2026", sampai: "31 JUL 2026", awal: 2_500_000, baris: [{ tgl: "06 JUL", atas: ["Fund Placement"], n: -2_000_000, bawah: ["Time Deposit"] }] })),
  );
  const r = rencanakan({ bacaan: [juli], kantong, transaksi: [buatan], kategori: null, sudahAda: new Set() });
  const ref = juli.rekening[0].baris[0].ref;
  assert.deepEqual(r.tautkan, [{ id: "buat", ref_bank: ref }]);
  assert.equal(r.sisip.filter((t) => t.amount === 2_000_000).length, 0, "tidak ada pindah kantong kedua");
  assert.equal(r.rekening[0].tercatat, 1);
  // Tanpa pindah kantong pembuatan: tetap pindah kantong baru dari rekening koran.
  const r2 = rencanakan({ bacaan: [juli], kantong, transaksi: [], kategori: null, sudahAda: new Set() });
  assert.deepEqual(r2.sisip.map((t) => [t.type, t.kantong_id, t.kantong_tujuan_id, t.amount]), [["transfer", "sea", "dep", 2_000_000]]);
  // Urutan baris rekening disimpan (created_at saat impor).
  assert.equal(typeof r2.sisip[0].urut, "number");
}

console.log("uji:lengkapi lulus");
