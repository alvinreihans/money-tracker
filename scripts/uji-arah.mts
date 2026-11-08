/**
 * Uji arah bukti transfer (SPEC-catat-tuntas): pencocokan nama, keputusan
 * arah dari nama & kantong, isian per arah, belajar nama, bacaan jawaban.
 */
import assert from "node:assert/strict";
import { pertanyaanDraft } from "../src/lib/draft.ts";
import { alasanDraft } from "../src/lib/kantong.ts";
import { bacaArah, bacaBukti, gabungNama, isianArah, kalimatArah, kantongBank, kantongNomor, namaDariJawaban, namaSama, tentukanArah, type BuktiTransfer } from "../src/lib/arah.ts";
import { simpanPetunjuk } from "../src/lib/petunjuk.ts";

// --- Nama
assert.ok(namaSama("Rina Kartika Sari", "RINA KARTIKA SARI"));
assert.ok(namaSama("Rina Kartika Sari", "RINA KARTIKA"), "2 kata cukup");
assert.ok(!namaSama("Rina Kartika Sari", "RINA"), "1 kata dari nama panjang tidak cukup");
assert.ok(!namaSama("Rina Kartika", "Rina Pratiwi"), "Rina lain");
assert.ok(namaSama("Rina Kartika Sari", "RIN*** KAR*** SAR***"), "tersamar");
assert.ok(namaSama("Rina Kartika Sari", "Rina K Sari"), "inisial");
assert.ok(namaSama("Ibu Rina Kartika", "rina kartika"), "gelar diabaikan");
assert.ok(namaSama("Soeharto", "SOEHARTO"), "nama satu kata");
assert.ok(!namaSama("Dewi Lestari", "Rina Kartika"));
assert.ok(!namaSama("***", "Rina Kartika"));

// --- Kantong dari nama bank
const kantong = [
  { id: "sea", name: "SeaBank", aliases: [] },
  { id: "gopay", name: "GoPay", aliases: [] },
];
assert.equal(kantongBank("BANK SEABANK INDONESIA", kantong)?.id, "sea");
assert.equal(kantongBank("SeaBank", kantong)?.id, "sea");
assert.equal(kantongBank("OCBC", kantong), null);
assert.equal(kantongBank(null, kantong), null);

// --- Arah: kasus laporan user (Dewi → Rina, OCBC → SeaBank)
const laporan: BuktiTransfer = { pengirim: { nama: "DEWI LESTARI", bank: "OCBC" }, penerima: { nama: "RINA KARTIKA SARI", bank: "BANK SEABANK INDONESIA" } };
assert.equal(tentukanArah(laporan, ["Rina Kartika Sari"], []), "masuk", "nama user = penerima");
assert.equal(tentukanArah(laporan, [], kantong), "masuk", "hanya bank penerima yang kantong user");
assert.equal(tentukanArah(laporan, [], []), null, "tanpa nama & kantong → tanya");
assert.equal(tentukanArah(laporan, ["Dewi Lestari"], []), "keluar", "nama user = pengirim");
assert.equal(tentukanArah(laporan, ["Dewi Lestari", "Rina Kartika"], []), "pindah");
const keduaBank = { pengirim: { nama: "A B", bank: "GoPay" }, penerima: { nama: "C D", bank: "SeaBank" } };
assert.equal(tentukanArah(keduaBank, [], kantong), null, "kedua bank milik user tapi nama tak dikenal → tanya");
assert.equal(tentukanArah({ pengirim: { nama: "X Y", bank: "GoPay" }, penerima: { nama: "Budi Santoso", bank: "BCA" } }, [], kantong), "keluar");
// Nama menang atas kantong.
assert.equal(tentukanArah(keduaBank, ["C D"], kantong), "masuk");

// --- Isian per arah
assert.deepEqual(isianArah(laporan, "masuk"), { type: "income", category: "other", merchant: "Dewi Lestari", payment_method: "BANK SEABANK INDONESIA", payment_target: null });
assert.equal(isianArah(laporan, "keluar").merchant, "Rina Kartika Sari");
assert.equal(isianArah(laporan, "keluar").payment_method, "OCBC");
assert.equal(isianArah(laporan, "pindah").payment_target, "BANK SEABANK INDONESIA");

// --- Belajar nama
assert.deepEqual(namaDariJawaban(laporan, "masuk"), ["Rina Kartika Sari"]);
assert.deepEqual(namaDariJawaban(laporan, "keluar"), ["Dewi Lestari"]);
assert.deepEqual(gabungNama(["Rina Kartika Sari"], ["RINA KARTIKA"]), ["Rina Kartika Sari"], "tidak dobel");
assert.equal(gabungNama(["a b", "c d", "e f", "g h", "i j"], ["k l"]).length, 5);
assert.equal(gabungNama(["a b"], ["k l"])[0], "k l", "terbaru di depan");

// --- Jawaban & kalimat
assert.equal(bacaArah("Aku terima"), "masuk");
assert.equal(bacaArah("aku kirim"), "keluar");
assert.equal(bacaArah("Pindah antar rekeningku"), "pindah");
assert.equal(bacaArah("hah?"), null);
assert.equal(kalimatArah(laporan), "Ini kamu yang kirim ke Rina, atau terima dari Dewi?");
assert.deepEqual(bacaBukti(JSON.stringify(laporan)), laporan);
assert.equal(bacaBukti("rusak"), null);
assert.equal(bacaBukti(null), null);

// --- Draft yang menunggu arah: ditanya "arah" dulu (setelah nominal), alasannya "arah".
const draft = { status: "needs_review", amount: 16000, type: "expense", category: "other", merchant: "Rina", kantong_id: null, kantong_tujuan_id: null, bukti_transfer: JSON.stringify(laporan) };
assert.equal(pertanyaanDraft(draft), "arah");
assert.equal(pertanyaanDraft({ ...draft, amount: 0 }), "nominal", "nominal tetap yang pertama");
assert.equal(pertanyaanDraft({ ...draft, bukti_transfer: null }), "kantong", "setelah dijawab → kantong");
assert.equal(alasanDraft(draft), "arah");

// --- SPEC-kantong-sendiri B-1–B-3: nomor rekening tujuan & nama pemilik (data BUATAN).
const milik = [
  { id: "dana", name: "DANA", aliases: [], nomor_akhir: null },
  { id: "jago", name: "Jago", aliases: [], nomor_akhir: "4321" },
  { id: "bca", name: "BCA", aliases: [], nomor_akhir: "4321" },
];
assert.equal(kantongNomor("JAGO …4321", milik)?.id, "jago", "nomor sama di dua kantong → nama bank menentukan");
assert.equal(kantongNomor("BCA 0000004321", milik)?.id, "bca");
assert.equal(kantongNomor("Jago …9999", milik), null);
assert.equal(kantongNomor(null, milik), null);
// "Send Money to <nama user> – JAGO ••4321" dari DANA (tanpa nama pengirim).
const kirimSendiri: BuktiTransfer = { pengirim: { nama: null, bank: "DANA" }, penerima: { nama: "SITI AMINAH", bank: "JAGO" } };
assert.equal(tentukanArah(kirimSendiri, [], milik, "JAGO …4321"), "pindah", "nomor tujuan = kantong user, dikirim dari kantong user");
assert.equal(tentukanArah(kirimSendiri, ["Siti Aminah"], milik.slice(0, 1)), "pindah", "nama penerima = user, dari kantong user, tanpa nama pengirim");
assert.equal(tentukanArah(kirimSendiri, ["Siti Aminah"], []), "masuk", "pengirim bukan kantong user → tetap masuk");
const dariOrang: BuktiTransfer = { pengirim: { nama: "BUDI HARTONO", bank: "BRI" }, penerima: { nama: "SITI AMINAH", bank: "JAGO" } };
assert.equal(tentukanArah(dariOrang, [], milik, "JAGO …4321"), "masuk", "orang lain mengirim ke rekening user");
assert.equal(tentukanArah({ ...dariOrang, pengirim: { nama: "SITI AMINAH", bank: "BRI" } }, ["Siti Aminah"], milik, "JAGO …4321"), "pindah");
// Kolom bukti_transfer yang hanya berisi petunjuk kantong bukan bukti: tidak ditanya arah.
const petunjukSaja = simpanPetunjuk(null, { sumber: "GoPay" });
assert.equal(bacaBukti(petunjukSaja), null);
assert.equal(pertanyaanDraft({ ...draft, bukti_transfer: petunjukSaja }), "kantong");
assert.equal(alasanDraft({ ...draft, bukti_transfer: petunjukSaja }), "kantong");
const buktiDanPetunjuk = simpanPetunjuk(JSON.stringify(laporan), { nomor_tujuan: "4321" });
assert.deepEqual(bacaBukti(buktiDanPetunjuk)?.pengirim, laporan.pengirim);
assert.equal(pertanyaanDraft({ ...draft, bukti_transfer: buktiDanPetunjuk }), "arah");

console.log("✓ arah bukti transfer: nama (tersamar, inisial, gelar, satu kata), kantong bank, keputusan arah, isian, belajar nama, jawaban, nomor rekening tujuan & kirim ke rekening sendiri (B-2/B-3), petunjuk kantong bukan bukti");
