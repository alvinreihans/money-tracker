/**
 * Uji arah bukti transfer (SPEC-catat-tuntas): pencocokan nama, keputusan
 * arah dari nama & kantong, isian per arah, belajar nama, bacaan jawaban.
 */
import assert from "node:assert/strict";
import { pertanyaanDraft } from "../src/lib/draft.ts";
import { alasanDraft } from "../src/lib/kantong.ts";
import { bacaArah, bacaBukti, gabungNama, isianArah, kalimatArah, kantongBank, namaDariJawaban, namaSama, tentukanArah, type BuktiTransfer } from "../src/lib/arah.ts";

// --- Nama
assert.ok(namaSama("Alvin Reihansyah Makarim", "ALVIN REIHANSYAH MAKARIM"));
assert.ok(namaSama("Alvin Reihansyah Makarim", "ALVIN REIHANSYAH"), "2 kata cukup");
assert.ok(!namaSama("Alvin Reihansyah Makarim", "ALVIN"), "1 kata dari nama panjang tidak cukup");
assert.ok(!namaSama("Alvin Reihansyah", "Alvin Pratama"), "Alvin lain");
assert.ok(namaSama("Alvin Reihansyah Makarim", "ALV*** REI*** MAK***"), "tersamar");
assert.ok(namaSama("Alvin Reihansyah Makarim", "Alvin R Makarim"), "inisial");
assert.ok(namaSama("Bapak Alvin Reihansyah", "alvin reihansyah"), "gelar diabaikan");
assert.ok(namaSama("Soeharto", "SOEHARTO"), "nama satu kata");
assert.ok(!namaSama("Septiyana Pangsor", "Alvin Reihansyah"));
assert.ok(!namaSama("***", "Alvin Reihansyah"));

// --- Kantong dari nama bank
const kantong = [
  { id: "sea", name: "SeaBank", aliases: [] },
  { id: "gopay", name: "GoPay", aliases: [] },
];
assert.equal(kantongBank("BANK SEABANK INDONESIA", kantong)?.id, "sea");
assert.equal(kantongBank("SeaBank", kantong)?.id, "sea");
assert.equal(kantongBank("OCBC", kantong), null);
assert.equal(kantongBank(null, kantong), null);

// --- Arah: kasus laporan user (Septiyana → Alvin, OCBC → SeaBank)
const laporan: BuktiTransfer = { pengirim: { nama: "SEPTIYANA PANGSOR", bank: "OCBC" }, penerima: { nama: "ALVIN REIHANSYAH MAKARIM", bank: "BANK SEABANK INDONESIA" } };
assert.equal(tentukanArah(laporan, ["Alvin Reihansyah Makarim"], []), "masuk", "nama user = penerima");
assert.equal(tentukanArah(laporan, [], kantong), "masuk", "hanya bank penerima yang kantong user");
assert.equal(tentukanArah(laporan, [], []), null, "tanpa nama & kantong → tanya");
assert.equal(tentukanArah(laporan, ["Septiyana Pangsor"], []), "keluar", "nama user = pengirim");
assert.equal(tentukanArah(laporan, ["Septiyana Pangsor", "Alvin Reihansyah"], []), "pindah");
const keduaBank = { pengirim: { nama: "A B", bank: "GoPay" }, penerima: { nama: "C D", bank: "SeaBank" } };
assert.equal(tentukanArah(keduaBank, [], kantong), null, "kedua bank milik user tapi nama tak dikenal → tanya");
assert.equal(tentukanArah({ pengirim: { nama: "X Y", bank: "GoPay" }, penerima: { nama: "Budi Santoso", bank: "BCA" } }, [], kantong), "keluar");
// Nama menang atas kantong.
assert.equal(tentukanArah(keduaBank, ["C D"], kantong), "masuk");

// --- Isian per arah
assert.deepEqual(isianArah(laporan, "masuk"), { type: "income", category: "other", merchant: "Septiyana Pangsor", payment_method: "BANK SEABANK INDONESIA", payment_target: null });
assert.equal(isianArah(laporan, "keluar").merchant, "Alvin Reihansyah Makarim");
assert.equal(isianArah(laporan, "keluar").payment_method, "OCBC");
assert.equal(isianArah(laporan, "pindah").payment_target, "BANK SEABANK INDONESIA");

// --- Belajar nama
assert.deepEqual(namaDariJawaban(laporan, "masuk"), ["Alvin Reihansyah Makarim"]);
assert.deepEqual(namaDariJawaban(laporan, "keluar"), ["Septiyana Pangsor"]);
assert.deepEqual(gabungNama(["Alvin Reihansyah Makarim"], ["ALVIN REIHANSYAH"]), ["Alvin Reihansyah Makarim"], "tidak dobel");
assert.equal(gabungNama(["a b", "c d", "e f", "g h", "i j"], ["k l"]).length, 5);
assert.equal(gabungNama(["a b"], ["k l"])[0], "k l", "terbaru di depan");

// --- Jawaban & kalimat
assert.equal(bacaArah("Aku terima"), "masuk");
assert.equal(bacaArah("aku kirim"), "keluar");
assert.equal(bacaArah("Pindah antar rekeningku"), "pindah");
assert.equal(bacaArah("hah?"), null);
assert.equal(kalimatArah(laporan), "Ini kamu yang kirim ke Alvin, atau terima dari Septiyana?");
assert.deepEqual(bacaBukti(JSON.stringify(laporan)), laporan);
assert.equal(bacaBukti("rusak"), null);
assert.equal(bacaBukti(null), null);

// --- Draft yang menunggu arah: ditanya "arah" dulu (setelah nominal), alasannya "arah".
const draft = { status: "needs_review", amount: 16000, type: "expense", category: "other", merchant: "Alvin", kantong_id: null, kantong_tujuan_id: null, bukti_transfer: JSON.stringify(laporan) };
assert.equal(pertanyaanDraft(draft), "arah");
assert.equal(pertanyaanDraft({ ...draft, amount: 0 }), "nominal", "nominal tetap yang pertama");
assert.equal(pertanyaanDraft({ ...draft, bukti_transfer: null }), "kantong", "setelah dijawab → kantong");
assert.equal(alasanDraft(draft), "arah");

console.log("✓ arah bukti transfer: nama (tersamar, inisial, gelar, satu kata), kantong bank, keputusan arah, isian, belajar nama, jawaban");
