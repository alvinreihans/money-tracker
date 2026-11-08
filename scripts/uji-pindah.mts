/**
 * Uji uang antar kantong sendiri (SPEC-kantong-sendiri): penautan ulang saat
 * kantong dibuat (cariCalonPindah, A-3), tebakan jenis kantong (A-1), pembaku
 * paylater (D-1), dan nama pemilik dari rekening koran (B-1). Data BUATAN.
 *
 * Pemakaian: npm run uji:pindah
 */
import assert from "node:assert/strict";
import { cariCalonPindah, isianJadikanPindah, kalimatCalonPindah, namaLembaga, pihakDariTeks, tebakJenisKantong, type TransaksiPindah } from "../src/lib/pindah.ts";
import { bakukanPaylater, penyediaPaylater } from "../src/lib/paylater-nama.ts";
import { kandidatCicilan, pilihCicilan } from "../src/lib/pinjaman.ts";
import { namaDariMetadata, namaRekeningBaru, namaTersamar } from "../src/lib/nama-rekening.ts";
import type { HasilBaca } from "../src/lib/rekening/jenis.ts";

// ------------------------------------------------------------ tebakan jenis kantong (A-1)

for (const [nama, jenis] of [
  ["DANA", "ewallet"],
  ["GoPay", "ewallet"],
  ["OVO", "ewallet"],
  ["ShopeePay", "ewallet"],
  ["LinkAja", "ewallet"],
  ["Flip", "ewallet"],
  ["Jenius Pay", "ewallet"],
  ["BRI", "bank"],
  ["Bank Jago", "bank"],
  ["SeaBank", "bank"],
  ["Tunai", "cash"],
  ["Cash", "cash"],
  ["Shopee PayLater", "kredit"],
  ["SPinjam", "kredit"],
  ["GoPayLater", "kredit"],
  ["Kredivo", "kredit"],
  ["Tabungan Rumah", "bank"],
] as const)
  assert.equal(tebakJenisKantong(nama), jenis, `jenis ${nama}`);

assert.equal(namaLembaga("BANK JAGO"), "Jago");
assert.equal(namaLembaga("Dana"), "DANA");
assert.equal(namaLembaga("ShopeePay"), "ShopeePay");
assert.equal(namaLembaga("Shopee"), "ShopeePay");
assert.equal(namaLembaga("blu by BCA Digital"), "blu");
assert.equal(namaLembaga("PT BANK CONTOH"), null, "bank tak dikenal");
assert.equal(namaLembaga("Bank Lain"), null);
assert.equal(namaLembaga("SPayLater"), null, "paylater bukan e-wallet/bank");

// ------------------------------------------------------------ pembaku paylater (D-1)

for (const [teks, baku] of [
  ["SPayLater", "Shopee PayLater"],
  ["Shopee PayLater", "Shopee PayLater"],
  ["ShopeePay Later", "Shopee PayLater"],
  ["shopee pay later", "Shopee PayLater"],
  ["SPinjam", "SPinjam"],
  ["Pembayaran SPinjam Shopee", "SPinjam"],
  ["GoPay Later", "GoPayLater"],
  ["Kredivo", "Kredivo"],
] as const)
  assert.equal(penyediaPaylater(teks), baku, `pembaku ${teks}`);
assert.equal(penyediaPaylater("ShopeePay"), null, "e-wallet bukan paylater");
assert.equal(penyediaPaylater("Top Up DANA"), null);
assert.equal(bakukanPaylater("ShopeePay", true), "Shopee PayLater", "isian paylater AI: longgar");
assert.equal(bakukanPaylater("ShopeePay"), "ShopeePay", "tanpa longgar: apa adanya");
assert.equal(bakukanPaylater("  Home Credit  "), "Home Credit");

// pilihCicilan membandingkan nama yang sudah dibakukan, dua arah.
const rencana = [{ id: "c1", nama: "Sepatu", penyedia: "Shopee PayLater", tenor: 3, jatuh_tempo_awal: "2026-10-05", nominal: 100_000 }];
assert.deepEqual(pilihCicilan("SPayLater", rencana, {}, "2026-10-01"), { rencana: rencana[0], ke: 1 }, "sebutan AI SPayLater → penyedia Shopee PayLater");
assert.deepEqual(pilihCicilan("Shopee PayLater", [{ ...rencana[0], penyedia: "SPayLater" }], {}, "2026-10-01")?.ke, 1, "penyedia tersimpan SPayLater → sebutan baku");
assert.equal(pilihCicilan("SPinjam", rencana, {}, "2026-10-01"), null, "SPinjam bukan Shopee PayLater");

// D-2: beberapa rencana penyedia yang sama → semua jadi kandidat (ditanya "Cicilan yang mana?"), jatuh tempo terdekat dulu.
{
  const dua = [rencana[0], { ...rencana[0], id: "c2", nama: "Jaket", jatuh_tempo_awal: "2026-09-25" }];
  assert.deepEqual(kandidatCicilan("SPayLater", dua, {}, "2026-09-20").map((k) => k.rencana.id), ["c2", "c1"]);
  assert.deepEqual(kandidatCicilan("Sepatu", dua, {}, "2026-09-20").map((k) => k.rencana.id), ["c1"], "nama barang → satu");
  assert.deepEqual(kandidatCicilan("SPayLater", dua, { c2: [1, 2, 3] }, "2026-09-20").map((k) => k.rencana.id), ["c1"], "yang lunas tidak ditawarkan");
  assert.deepEqual(kandidatCicilan("Kredivo", dua, {}, "2026-09-20"), [], "tidak ada → kantong utang (D-4)");
}

// ------------------------------------------------------------ nama pemilik dari rekening koran (B-1)

const baca = (pemilik: string | null) => ({ format: "bri", bank: "bri", pemilik, rekening: [], deposito: [] }) as HasilBaca;
assert.deepEqual(namaRekeningBaru([], [baca("BUDI SANTOSO")]), ["Budi Santoso"]);
assert.equal(namaRekeningBaru(["Budi Santoso"], [baca("BUDI SANTOSO")]), null, "sudah ada → tidak ada yang baru");
assert.equal(namaRekeningBaru([], [baca("BUDX SAXXXXX")]), null, "tersamar tidak disimpan");
assert.equal(namaRekeningBaru([], [baca(null)]), null);
assert.deepEqual(namaRekeningBaru(["Ani Wijaya"], [baca("BUDI SANTOSO"), baca("BUDI SANTOSO")]), ["Budi Santoso", "Ani Wijaya"]);
assert.equal(namaRekeningBaru(["A B", "C D", "E F", "G H", "I J"], [baca("BUDI SANTOSO")])?.length, 5, "maks 5");
assert.ok(namaTersamar("REI***") && namaTersamar("BUDX SAXXXXX") && !namaTersamar("ALEX WIJAYA"));
assert.deepEqual(namaDariMetadata({ nama_rekening: ["Budi Santoso", 3] }), ["Budi Santoso"]);
assert.deepEqual(namaDariMetadata(undefined), []);

// ------------------------------------------------------------ pihak dari teks tersimpan

assert.deepEqual(pihakDariTeks("DANA", "Top Up DANA 0812xxxx345 BUDX SAXXXXX via BRImo"), { bank: ["DANA", "Top Up DANA 0812xxxx345 BUDX SAXXXXX via BRImo"], nama: ["BUDX SAXXXXX", "DANA"], nomor: [] });
assert.deepEqual(pihakDariTeks("BUDI SANTOSO", "BUDI SANTOSO · Transfer Keluar · DANA …4455").nomor, ["4455"]);
assert.ok(pihakDariTeks("BUDI SANTOSO", "BUDI SANTOSO · JAGO").bank.includes("JAGO"), "SeaBank: bank lawan di uraian");

// ------------------------------------------------------------ cariCalonPindah (A-3)

const DANA = { id: "dana", name: "DANA", kind: "ewallet", nomor_akhir: null };
const konteks = { namaUser: ["Budi Santoso"] };
let n = 0;
const tx = (isi: Partial<TransaksiPindah>): TransaksiPindah => ({
  id: `t${n++}`,
  amount: 50_000,
  type: "expense",
  status: "confirmed",
  source: "statement",
  merchant: "DANA",
  description: "Top Up DANA 0812xxxx345 BUDX SAXXXXX via BRImo",
  kantong_id: "bri",
  kantong_tujuan_id: null,
  transaction_date: "2026-09-05",
  waktu: "10:00:00",
  updated_at: "2026-11-01T00:00:00.000001+00:00",
  ...isi,
});
{
  const topUp = tx({});
  const orangLain = tx({ description: "Top Up DANA 0812xxxx999 DNID SXXX via BRImo" });
  const dariGambar = tx({ source: "receipt" });
  const sudahPindah = tx({ type: "transfer", kantong_tujuan_id: "jago" });
  const ewalletLain = tx({ merchant: "OVO", description: "Top Up OVO 0812xxxx345 BUDX SAXXXXX via BRImo" });
  const ikutan = tx({ induk_id: "x" });
  const draft = tx({ status: "needs_review" });
  const calon = cariCalonPindah(DANA, [topUp, orangLain, dariGambar, sudahPindah, ewalletLain, ikutan, draft], konteks);
  assert.deepEqual(
    calon.map((c) => [c.id, c.arah, c.tanda, c.gabung]),
    [[topUp.id, "ke", "nama", null]],
    "hanya rekening koran ke DANA atas nama sendiri (tersamar); orang lain, gambar (K4), sudah pindah, e-wallet lain, ikutan, draft tidak",
  );
  assert.deepEqual(cariCalonPindah(DANA, [topUp], { namaUser: [] }), [], "tanpa tanda rekening sendiri → tidak");
}
// Nomor: 4 digit akhir = nomor_akhir kantong, tanpa nama.
{
  const JAGO = { id: "jago", name: "Jago", kind: "bank", nomor_akhir: "5678" };
  const keJago = tx({ merchant: "PT CONTOH", description: "Transfer BI-Fast ke BANK JAGO - 1020000005678 - PT CONTOH", amount: 200_000 });
  const nomorLain = tx({ merchant: "ANI WIJAYA", description: "Transfer BI-Fast ke BANK JAGO - 1020000009999 - ANI WIJAYA" });
  const dariJago = tx({ type: "income", kantong_id: "sea", merchant: "BUDI SANTOSO", description: "BUDI SANTOSO · JAGO", amount: 75_000 });
  const calon = cariCalonPindah(JAGO, [keJago, nomorLain, dariJago], { namaUser: [] });
  assert.deepEqual(calon.map((c) => [c.id, c.arah, c.tanda]), [[keJago.id, "ke", "nomor"]], "nomor cocok; nomor lain & tanpa nama tidak");
  const denganNama = cariCalonPindah(JAGO, [keJago, nomorLain, dariJago], konteks);
  assert.deepEqual(denganNama.map((c) => [c.id, c.arah, c.tanda]).sort(), [[keJago.id, "ke", "nomor"], [dariJago.id, "dari", "nama"]].sort(), "pemasukan dari Jago atas nama sendiri");
}
// Sisi lawan sudah tercatat di DANA (mis. dari screenshot): digabung, bukan dibuat dua.
{
  const topUp = tx({ transaction_date: "2026-09-05", waktu: "10:00:00" });
  const topUp2 = tx({ transaction_date: "2026-09-07", waktu: null, amount: 30_000 });
  const masukDana = tx({ id: "m1", type: "income", source: "receipt", kantong_id: "dana", merchant: "BRI", description: null, transaction_date: "2026-09-05", waktu: "10:00:00" });
  const jamLain = tx({ id: "m2", type: "income", source: "receipt", kantong_id: "dana", transaction_date: "2026-09-05", waktu: "11:30:00" });
  const besok = tx({ id: "m3", type: "income", source: "text", kantong_id: "dana", transaction_date: "2026-09-08", waktu: null, amount: 30_000 });
  const keluarDana = tx({ id: "m4", type: "expense", source: "receipt", kantong_id: "dana", transaction_date: "2026-09-05", waktu: "10:00:00" });
  const calon = cariCalonPindah(DANA, [topUp, topUp2, masukDana, jamLain, besok, keluarDana], konteks);
  assert.deepEqual(calon.map((c) => [c.id, c.gabung?.id ?? null]), [[topUp.id, "m1"], [topUp2.id, "m3"]], "nominal sama, ±1 hari, menit sama bila berjam; jenis berlawanan");
  const isian = isianJadikanPindah(DANA, calon);
  assert.deepEqual(isian.ubah[0], { id: topUp.id, updated_at: topUp.updated_at, kantong_lawan: "dana", merchant: "Pindah ke DANA", gabung: { id: "m1", updated_at: masukDana.updated_at } });
  assert.equal(kalimatCalonPindah("DANA", calon), "2 transaksi lama sepertinya pindah ke DANA. Jadikan pindah kantong?");
}
// Rekening koran kantong itu sendiri tidak ditimbang (itu urusan impor, R2).
assert.deepEqual(cariCalonPindah(DANA, [tx({ kantong_id: "dana" })], konteks), []);

console.log("✓ pindah: tebakan jenis kantong, pembaku paylater & pilihCicilan/kandidatCicilan, nama pemilik rekening koran, cariCalonPindah (nama/nomor/tanpa tanda/sisi lawan digabung)");
